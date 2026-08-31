using System.Diagnostics;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace NexPlayUninstaller;

internal static class Program
{
    [STAThread]
    private static int Main()
    {
        ApplicationConfiguration.Initialize();
        return UninstallLauncher.Run();
    }
}

internal static class UninstallLauncher
{
    private const string ProductName = "NexPlay";
    private const string UninstallRegistryPath = @"Software\Microsoft\Windows\CurrentVersion\Uninstall";

    public static int Run()
    {
        try
        {
            var entry = FindInstalledEntry();
            if (entry is null)
            {
                MessageBox.Show(
                    $"{ProductName} is not installed on this PC.",
                    $"{ProductName} Uninstaller",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
                return 2;
            }

            var installLocationLine = string.IsNullOrWhiteSpace(entry.InstallLocation)
                ? string.Empty
                : $"{Environment.NewLine}{Environment.NewLine}Install location:{Environment.NewLine}{entry.InstallLocation}";
            var versionLine = string.IsNullOrWhiteSpace(entry.DisplayVersion)
                ? string.Empty
                : $"Version: {entry.DisplayVersion}{Environment.NewLine}";

            var confirmation = MessageBox.Show(
                $"This will uninstall {ProductName}.{Environment.NewLine}{Environment.NewLine}{versionLine}The official uninstall wizard will open next.{installLocationLine}",
                $"Uninstall {ProductName}",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question,
                MessageBoxDefaultButton.Button2);

            if (confirmation != DialogResult.Yes)
            {
                return 0;
            }

            var startInfo = BuildStartInfo(entry.UninstallCommand);
            using var process = Process.Start(startInfo);
            if (process is null)
            {
                throw new InvalidOperationException("The NexPlay uninstaller could not be started.");
            }

            process.WaitForExit();

            if (process.ExitCode == 0)
            {
                MessageBox.Show(
                    $"{ProductName} uninstall finished.",
                    $"{ProductName} Uninstaller",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
                return 0;
            }

            MessageBox.Show(
                $"The NexPlay uninstaller exited with code {process.ExitCode}.",
                $"{ProductName} Uninstaller",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return process.ExitCode;
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                ex.Message,
                $"{ProductName} Uninstaller",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return 1;
        }
    }

    private static InstalledAppEntry? FindInstalledEntry()
    {
        var entries = new List<InstalledAppEntry>();
        entries.AddRange(ReadEntries(RegistryHive.CurrentUser, RegistryView.Default));
        entries.AddRange(ReadEntries(RegistryHive.LocalMachine, RegistryView.Registry64));
        entries.AddRange(ReadEntries(RegistryHive.LocalMachine, RegistryView.Registry32));

        return entries
            .OrderByDescending(entry => entry.Version)
            .FirstOrDefault();
    }

    private static IEnumerable<InstalledAppEntry> ReadEntries(RegistryHive hive, RegistryView view)
    {
        using var baseKey = RegistryKey.OpenBaseKey(hive, view);
        using var uninstallKey = baseKey.OpenSubKey(UninstallRegistryPath);
        if (uninstallKey is null)
        {
            yield break;
        }

        foreach (var subKeyName in uninstallKey.GetSubKeyNames())
        {
            using var appKey = uninstallKey.OpenSubKey(subKeyName);
            if (appKey is null)
            {
                continue;
            }

            var displayName = appKey.GetValue("DisplayName") as string;
            if (string.IsNullOrWhiteSpace(displayName) || !displayName.StartsWith(ProductName, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var uninstallString = appKey.GetValue("UninstallString") as string;
            if (string.IsNullOrWhiteSpace(uninstallString))
            {
                continue;
            }

            yield return new InstalledAppEntry(
                displayName.Trim(),
                (appKey.GetValue("DisplayVersion") as string)?.Trim() ?? string.Empty,
                uninstallString.Trim(),
                (appKey.GetValue("InstallLocation") as string)?.Trim() ?? string.Empty,
                ParseVersion(appKey.GetValue("DisplayVersion") as string));
        }
    }

    private static Version ParseVersion(string? rawVersion)
    {
        if (string.IsNullOrWhiteSpace(rawVersion))
        {
            return new Version(0, 0, 0, 0);
        }

        var cleaned = Regex.Replace(rawVersion, @"[^0-9.]", string.Empty);
        return Version.TryParse(cleaned, out var version)
            ? version
            : new Version(0, 0, 0, 0);
    }

    private static ProcessStartInfo BuildStartInfo(string commandText)
    {
        var (fileName, arguments) = ParseCommand(commandText);
        if (!File.Exists(fileName))
        {
            throw new FileNotFoundException("The installed NexPlay uninstaller was not found.", fileName);
        }

        return new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            UseShellExecute = true,
            WorkingDirectory = Path.GetDirectoryName(fileName) ?? Environment.CurrentDirectory
        };
    }

    private static (string FileName, string Arguments) ParseCommand(string commandText)
    {
        var trimmed = commandText.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            throw new InvalidOperationException("The uninstall command is empty.");
        }

        if (trimmed.StartsWith("\"", StringComparison.Ordinal))
        {
            var endQuote = trimmed.IndexOf('"', 1);
            if (endQuote <= 1)
            {
                throw new InvalidOperationException($"Could not parse uninstall command: {commandText}");
            }

            var fileName = trimmed[1..endQuote];
            var arguments = trimmed[(endQuote + 1)..].Trim();
            return (fileName, arguments);
        }

        var firstSpace = trimmed.IndexOf(' ');
        if (firstSpace < 0)
        {
            return (trimmed, string.Empty);
        }

        return (trimmed[..firstSpace], trimmed[(firstSpace + 1)..].Trim());
    }
}

internal sealed record InstalledAppEntry(
    string DisplayName,
    string DisplayVersion,
    string UninstallCommand,
    string InstallLocation,
    Version Version);
