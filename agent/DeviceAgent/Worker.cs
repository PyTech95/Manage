using System.Diagnostics;
using System.IO.Pipes;
using System.Management;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using SocketIOClient;

public class Worker : BackgroundService
{
    private readonly ILogger<Worker> _logger;
    private readonly IHttpClientFactory _httpClientFactory;

    private string? _deviceToken;
    private readonly string _deviceId = Environment.MachineName;

    // ✅ Production backend
    // private const string BackendBaseUrl = "https://managexbackend.onrender.com";
    private const string BackendBaseUrl = "http://localhost:8080";

    private SocketIOClient.SocketIO? _socket;

    // Overlay + Pipe
    private Process? _overlayProc;
    private CancellationTokenSource? _pipeCts;

    // Keep a single pipe name for the device
    private string PipeName => $"ManageX.LockPipe.{_deviceId}";

    public Worker(ILogger<Worker> logger, IHttpClientFactory httpClientFactory)
    {
        _logger = logger;
        _httpClientFactory = httpClientFactory;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Agent started. DeviceId={deviceId}", _deviceId);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // ✅ Register (and get token) once
                if (string.IsNullOrWhiteSpace(_deviceToken))
                {
                    _deviceToken = await RegisterDeviceAsync(stoppingToken);
                    if (string.IsNullOrWhiteSpace(_deviceToken))
                    {
                        _logger.LogWarning("Register failed. Retrying in 30s...");
                        await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
                        continue;
                    }
                }

                // ✅ Start socket once (await it so failures are logged)
                await StartSocketAsync(stoppingToken);

                // ✅ Run loops
                await Task.WhenAll(
                    HeartbeatLoop(stoppingToken),
                    ProcessTrackingLoop(stoppingToken)
                );
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Fatal loop error. Retrying in 10s...");
                await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
            }
        }

        // cleanup on exit
        StopOverlay();
        await StopSocketAsync();
    }

    // ================= HTTP Helpers =================

    private HttpClient CreateAuthedClient()
    {
        var client = _httpClientFactory.CreateClient();
        client.BaseAddress = new Uri(BackendBaseUrl);

        client.DefaultRequestHeaders.Remove("X-Device-Token");
        if (!string.IsNullOrWhiteSpace(_deviceToken))
            client.DefaultRequestHeaders.Add("X-Device-Token", _deviceToken);

        return client;
    }

    private async Task<string?> RegisterDeviceAsync(CancellationToken ct)
    {
        try
        {
            var client = _httpClientFactory.CreateClient();
            client.BaseAddress = new Uri(BackendBaseUrl);

            var payload = new
            {
                deviceId = _deviceId,
                username = Environment.UserName,
                os = Environment.OSVersion.ToString(),
                model = GetDeviceModel()
            };

            var resp = await client.PostAsJsonAsync("/api/device/register", payload, ct);
            var body = await resp.Content.ReadAsStringAsync(ct);

            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogError("Registration failed {code}. Body={body}", (int)resp.StatusCode, body);
                return null;
            }

            var result = await resp.Content.ReadFromJsonAsync<RegisterResponse>(cancellationToken: ct);
            if (string.IsNullOrWhiteSpace(result?.DeviceToken))
            {
                _logger.LogError("Registration OK but token missing. Body={body}", body);
                return null;
            }

            _logger.LogInformation("Registered OK.");
            return result.DeviceToken;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Registration exception.");
            return null;
        }
    }

    private async Task HeartbeatLoop(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                if (!string.IsNullOrWhiteSpace(_deviceToken))
                {
                    var client = CreateAuthedClient();
                    var resp = await client.PostAsJsonAsync("/api/device/heartbeat",
                        new { deviceId = _deviceId }, ct);

                    _logger.LogInformation("Heartbeat {code}", (int)resp.StatusCode);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Heartbeat exception");
            }

            await Task.Delay(TimeSpan.FromSeconds(30), ct);
        }
    }

    private async Task ProcessTrackingLoop(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                if (!string.IsNullOrWhiteSpace(_deviceToken))
                {
                    var processes = Process.GetProcesses()
                        .Select(p => p.ProcessName.ToLowerInvariant())
                        .Distinct()
                        .ToList();

                    var client = CreateAuthedClient();
                    await client.PostAsJsonAsync("/api/usage/process-snapshot",
                        new { deviceId = _deviceId, processes }, ct);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Process tracking exception");
            }

            await Task.Delay(TimeSpan.FromSeconds(15), ct);
        }
    }

    // ================= Socket =================

    private async Task StartSocketAsync(CancellationToken ct)
    {
        try
        {
            // ✅ prevent duplicate sockets
            if (_socket is { Connected: true }) return;

            _socket?.Dispose();

            _socket = new SocketIOClient.SocketIO(BackendBaseUrl, new SocketIOOptions
            {
                Reconnection = true,
                ReconnectionAttempts = int.MaxValue,
                ReconnectionDelay = 1500,
            });

            _socket.OnConnected += async (_, __) =>
            {
                _logger.LogInformation("Socket connected. Joining device room...");
                await _socket.EmitAsync("join-device", new { deviceId = _deviceId });
            };

            _socket.OnDisconnected += (_, reason) =>
            {
                _logger.LogWarning("Socket disconnected. Reason={reason}", reason);
            };

            _socket.On("command", async response =>
            {
                var cmd = response.GetValue<CommandPayload>();
                _logger.LogInformation("Command received: {cmd}", cmd.Command);

                if (cmd.Command == "LOCK")
                {
                    StartOverlayWithPipe(cmd.Message);
                }
                else if (cmd.Command == "UNLOCK")
                {
                    StopOverlay();
                }

                await Task.CompletedTask;
            });

            await _socket.ConnectAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Socket failed");
        }
    }

    private async Task StopSocketAsync()
    {
        try
        {
            if (_socket != null)
            {
                await _socket.DisconnectAsync();
                _socket.Dispose();
                _socket = null;
            }
        }
        catch { }
    }

    // ================= Overlay + Named Pipe =================

    private void StartOverlayWithPipe(string? message)
    {
        try
        {
            if (!OperatingSystem.IsWindows()) return;

            // Already running
            if (_overlayProc != null && !_overlayProc.HasExited)
            {
                _logger.LogInformation("Overlay already running.");
                return;
            }

            // cancel previous pipe loop
            _pipeCts?.Cancel();
            _pipeCts?.Dispose();
            _pipeCts = new CancellationTokenSource();

            // start listening for code from overlay
            _ = Task.Run(() => PipeListenLoop(PipeName, _pipeCts.Token), _pipeCts.Token);

            var overlayPath = Path.Combine(AppContext.BaseDirectory, "LockOverlay.exe");
            if (!File.Exists(overlayPath))
            {
                _logger.LogError("LockOverlay.exe not found at {path}", overlayPath);
                return;
            }

            var args =
                $"--pipe \"{PipeName}\" --title \"DEVICE LOCKED\" --msg \"{EscapeArg(message ?? "Contact Admin")}\"";

            // ✅ UseShellExecute=true helps UI appear correctly when running as service
            _overlayProc = Process.Start(new ProcessStartInfo
            {
                FileName = overlayPath,
                Arguments = args,
                UseShellExecute = true
            });

            _logger.LogWarning("Overlay started.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Overlay start failed");
        }
    }

    private async Task PipeListenLoop(string pipeName, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                using var server = new NamedPipeServerStream(
                    pipeName,
                    PipeDirection.InOut,
                    1,
                    PipeTransmissionMode.Message,
                    PipeOptions.Asynchronous);

                await server.WaitForConnectionAsync(ct);

                using var reader = new StreamReader(server, Encoding.UTF8, false, 1024, leaveOpen: true);
                using var writer = new StreamWriter(server, Encoding.UTF8, 1024, leaveOpen: true) { AutoFlush = true };

                var code = (await reader.ReadLineAsync())?.Trim();
                if (string.IsNullOrWhiteSpace(code))
                {
                    await writer.WriteLineAsync("ERR:EMPTY");
                    continue;
                }

                var ok = await TryUnlockWithCodeAsync(code, ct);

                await writer.WriteLineAsync(ok ? "OK" : "ERR:INVALID");

                if (ok)
                {
                    StopOverlay();
                }
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Pipe loop error");
                await Task.Delay(800, ct);
            }
        }
    }

    private async Task<bool> TryUnlockWithCodeAsync(string code, CancellationToken ct)
    {
        try
        {
            var client = CreateAuthedClient();

            // ✅ IMPORTANT: endpoint must match backend route
            var resp = await client.PostAsJsonAsync("/api/device/unlock-with-code",
                new { code }, ct);

            if (resp.IsSuccessStatusCode)
            {
                _logger.LogInformation("Unlock verified OK.");
                return true;
            }

            var body = await resp.Content.ReadAsStringAsync(ct);
            _logger.LogWarning("Unlock failed {code}. Body={body}", (int)resp.StatusCode, body);
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Unlock exception");
            return false;
        }
    }

    private void StopOverlay()
    {
        try
        {
            _pipeCts?.Cancel();
            _pipeCts?.Dispose();
            _pipeCts = null;

            if (_overlayProc != null && !_overlayProc.HasExited)
            {
                _overlayProc.Kill(true);
                _overlayProc.Dispose();
            }
        }
        catch { }
        finally
        {
            _overlayProc = null;
            _logger.LogWarning("Overlay stopped.");
        }
    }

    private static string EscapeArg(string s) => s.Replace("\"", "'");

    private static string GetDeviceModel()
    {
        if (!OperatingSystem.IsWindows()) return "Unknown";
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT * FROM Win32_ComputerSystem");
            foreach (var obj in searcher.Get())
                return obj["Model"]?.ToString() ?? "Unknown";
        }
        catch { }
        return "Unknown";
    }

    private class RegisterResponse
    {
        [JsonPropertyName("deviceToken")]
        public string? DeviceToken { get; set; }
    }

    private class CommandPayload
    {
        [JsonPropertyName("command")]
        public string Command { get; set; } = "";

        [JsonPropertyName("message")]
        public string? Message { get; set; }

        // optional, backend may send it but agent doesn't need it
        [JsonPropertyName("unlockCode")]
        public string? UnlockCode { get; set; }
    }
}
