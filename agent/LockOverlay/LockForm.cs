using System;
using System.Drawing;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Windows.Forms;

public class LockForm : Form
{
 private readonly string _pipeName;

 private TextBox _codeBox = new TextBox();
 private Label _status = new Label();

 public LockForm(string pipeName, string title, string msg)
 {
  _pipeName = pipeName ?? "";

  // ===== Form Settings =====
  FormBorderStyle = FormBorderStyle.None;
  WindowState = FormWindowState.Maximized;
  TopMost = true;
  ShowInTaskbar = false;
  BackColor = Color.FromArgb(10, 10, 14);
  KeyPreview = true;

  // Block common close keys (not perfect, but helps)
  KeyDown += (_, e) =>
  {
   if (e.Alt && e.KeyCode == Keys.F4) e.Handled = true;
   if (e.Control && e.Shift && e.KeyCode == Keys.Escape) e.Handled = true;
  };

  // Prevent closing
  FormClosing += (_, e) => e.Cancel = true;

  // ===== Center Card Panel =====
  var card = new Panel
  {
   Width = 760,
   Height = 440,
   BackColor = Color.FromArgb(22, 22, 30)
  };
  Controls.Add(card);

  CenterCard(card);
  Resize += (_, __) => CenterCard(card);

  // ===== Title =====
  var h = new Label
  {
   Text = title,
   ForeColor = Color.White,
   Font = new Font("Segoe UI", 26, FontStyle.Bold),
   AutoSize = true,
   Left = 32,
   Top = 28
  };
  card.Controls.Add(h);

  // ===== Subtext =====
  var m = new Label
  {
   Text = msg + "\n\nConnect to Admin to get Unlock Code.",
   ForeColor = Color.Gainsboro,
   Font = new Font("Segoe UI", 12, FontStyle.Regular),
   AutoSize = true,
   Left = 32,
   Top = 90
  };
  card.Controls.Add(m);

  // ===== Divider line =====
  var line = new Panel
  {
   Height = 1,
   Width = card.Width - 64,
   Left = 32,
   Top = 190,
   BackColor = Color.FromArgb(50, 50, 70)
  };
  card.Controls.Add(line);

  // ===== Label =====
  var lbl = new Label
  {
   Text = "Enter Unlock Code",
   ForeColor = Color.Silver,
   Font = new Font("Segoe UI", 11, FontStyle.Regular),
   AutoSize = true,
   Left = 32,
   Top = 220
  };
  card.Controls.Add(lbl);

  // ===== Code input =====
  _codeBox = new TextBox
  {
   Left = 32,
   Top = 252,
   Width = 300,
   Font = new Font("Segoe UI", 18, FontStyle.Bold),
   ForeColor = Color.White,
   BackColor = Color.FromArgb(14, 14, 20),
   BorderStyle = BorderStyle.FixedSingle,
   TextAlign = HorizontalAlignment.Center
  };
  card.Controls.Add(_codeBox);

  _codeBox.KeyDown += (_, e) =>
  {
   if (e.KeyCode == Keys.Enter)
   {
    e.Handled = true;
    TryUnlock();
   }
  };

  // ===== Unlock button =====
  var btn = new Button
  {
   Text = "Unlock",
   Left = 350,
   Top = 252,
   Width = 160,
   Height = 44,
   Font = new Font("Segoe UI", 11, FontStyle.Bold),
   BackColor = Color.FromArgb(70, 110, 255),
   ForeColor = Color.White,
   FlatStyle = FlatStyle.Flat
  };
  btn.FlatAppearance.BorderSize = 0;
  btn.Click += (_, __) => TryUnlock();
  card.Controls.Add(btn);

  // ===== Small helper =====
  var hint = new Label
  {
   Text = "Hint: Ask Admin for unlock code shown in Admin Panel.",
   ForeColor = Color.FromArgb(170, 170, 190),
   Font = new Font("Segoe UI", 9, FontStyle.Regular),
   AutoSize = true,
   Left = 32,
   Top = 310
  };
  card.Controls.Add(hint);

  // ===== Status =====
  _status = new Label
  {
   Text = "",
   ForeColor = Color.Orange,
   Font = new Font("Segoe UI", 10, FontStyle.Regular),
   AutoSize = true,
   Left = 32,
   Top = 340
  };
  card.Controls.Add(_status);

  // Focus on input
  Shown += (_, __) => _codeBox.Focus();
 }

 private void CenterCard(Panel card)
 {
  card.Left = (Screen.PrimaryScreen.Bounds.Width - card.Width) / 2;
  card.Top = (Screen.PrimaryScreen.Bounds.Height - card.Height) / 2;
 }

 private void TryUnlock()
 {
  var code = _codeBox.Text?.Trim();
  if (string.IsNullOrWhiteSpace(code))
  {
   _status.Text = "Please enter unlock code.";
   return;
  }

  if (string.IsNullOrWhiteSpace(_pipeName))
  {
   _status.Text = "Pipe not provided. Contact Admin.";
   return;
  }

  try
  {
   using var client = new NamedPipeClientStream(".", _pipeName, PipeDirection.InOut);
   client.Connect(2000);

   using var writer = new StreamWriter(client, Encoding.UTF8, 1024, leaveOpen: true) { AutoFlush = true };
   using var reader = new StreamReader(client, Encoding.UTF8, false, 1024, leaveOpen: true);

   writer.WriteLine(code);
   var resp = reader.ReadLine();

   if (resp == "OK")
   {
    Environment.Exit(0);
    return;
   }

   _status.Text = "Invalid / expired code. Contact Admin.";
   _codeBox.SelectAll();
   _codeBox.Focus();
  }
  catch
  {
   _status.Text = "Unable to reach agent. Contact Admin.";
  }
 }
}
