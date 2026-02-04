using System;
using System.Windows.Forms;

internal static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();

        string pipe = "";
        string title = "DEVICE LOCKED";
        string msg = "This device is locked.\nPlease contact Admin to get unlock code.";

        for (int i = 0; i < args.Length; i++)
        {
            if (args[i] == "--pipe" && i + 1 < args.Length) pipe = args[i + 1];
            if (args[i] == "--title" && i + 1 < args.Length) title = args[i + 1];
            if (args[i] == "--msg" && i + 1 < args.Length) msg = args[i + 1];
        }

        Application.Run(new LockForm(pipe, title, msg));
    }
}
