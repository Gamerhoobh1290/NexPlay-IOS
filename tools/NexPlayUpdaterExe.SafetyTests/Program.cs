using System.Diagnostics;
using System.Reflection;
using NexPlayUpdater;

namespace NexPlayUpdaterSafetyTests;

internal static class SafetyTestProgram
{
    private static readonly Type LauncherType = typeof(UpdateLauncher);
    private static int _passed;

    private static int Main()
    {
        var tests = new Action[]
        {
            InstalledProductDiscoveryIsExact,
            SafeRelativePathsRejectEscapes,
            ReparsePointsAreRejected,
            SecureTransactionRootAndCleanupRejectReparsePoints,
            StaleCleanupCannotDeleteOutsideInstall,
            AtomicMetadataReplacementLeavesNoTemporaryFiles,
            PerInstallMutexRejectsConcurrentWorker,
            GracefulCloseSelectsEarliestMainProcessFirst,
            BackupRestoreReturnsExactPreviousFiles,
            FailedRollbackPreservesRecoveryBackup,
            ApplyingJournalRecoversAfterSimulatedCrash,
            FailedOrphanRecoveryPreservesDurableBackup,
            PostCommitLaunchFailureDoesNotThrow,
            SuccessfulInstallCommitsAndRemovesBackup,
            FailedInstallRollsBackCompleteDirectory
        };

        try
        {
            foreach (var test in tests)
            {
                test();
                _passed++;
                Console.WriteLine($"PASS {test.Method.Name}");
            }

            Console.WriteLine($"PASS {_passed}/{tests.Length} updater safety tests");
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"FAIL after {_passed}/{tests.Length}: {ex}");
            return 1;
        }
    }

    private static void InstalledProductDiscoveryIsExact()
    {
        Equal(true, (bool)Invoke("IsExactInstalledProductName", "NexPlay")!, "exact NexPlay product name");
        Equal(true, (bool)Invoke("IsExactInstalledProductName", "  nexplay  ")!, "trimmed NexPlay product name");
        Equal(true, (bool)Invoke("IsExactInstalledProductName", "NexPlay 2.0.2")!, "installed desktop version-suffixed product name");
        Equal(true, (bool)Invoke("IsExactInstalledProductName", "NexPlay 2.0.8.1")!, "four-part desktop version product name");
        Equal(false, (bool)Invoke("IsExactInstalledProductName", "NexPlay Offline")!, "offline product exclusion");
        Equal(false, (bool)Invoke("IsExactInstalledProductName", "NexPlay Offline 2.0.2")!, "versioned offline product exclusion");
        Equal(false, (bool)Invoke("IsExactInstalledProductName", "NexPlay Updater")!, "updater product exclusion");
        Equal(false, (bool)Invoke("IsExactInstalledProductName", "NexPlay Beta 2.0.8")!, "non-desktop product exclusion");
    }

    private static void SafeRelativePathsRejectEscapes()
    {
        using var scope = new TemporaryDirectory();
        var safe = (string)Invoke("GetSafeRelativePath", scope.Path, @"resources\app.asar", "test")!;
        Equal(@"resources\app.asar", safe, "safe relative path");

        ExpectUpdaterFailure("GetSafeRelativePath", scope.Path, @"..\outside.txt", "test");
        ExpectUpdaterFailure("GetSafeRelativePath", scope.Path, Path.Combine(scope.Path, "rooted.txt"), "test");
        ExpectUpdaterFailure("GetSafeRelativePath", scope.Path, @"sub\..\..\outside.txt", "test");
    }

    private static void StaleCleanupCannotDeleteOutsideInstall()
    {
        using var scope = new TemporaryDirectory();
        var install = Directory.CreateDirectory(Path.Combine(scope.Path, "install")).FullName;
        var victim = Path.Combine(scope.Path, "victim.txt");
        File.WriteAllText(victim, "must survive");
        var previous = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { @"..\victim.txt" };
        var current = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        ExpectUpdaterFailure("RemoveStaleFiles", install, previous, current);
        True(File.Exists(victim), "stale cleanup deleted a file outside the install root");
        Equal("must survive", File.ReadAllText(victim), "outside victim contents");
    }

    private static void ReparsePointsAreRejected()
    {
        using var scope = new TemporaryDirectory();
        var target = Directory.CreateDirectory(Path.Combine(scope.Path, "target")).FullName;
        var junction = Path.Combine(scope.Path, "junction");
        CreateJunction(junction, target);

        try
        {
            ExpectUpdaterFailure("EnsureTreeContainsNoReparsePoints", scope.Path, "test tree");
        }
        finally
        {
            if (Directory.Exists(junction)) Directory.Delete(junction);
        }
    }

    private static void SecureTransactionRootAndCleanupRejectReparsePoints()
    {
        using var scope = new TemporaryDirectory();
        var root = (string)Invoke("GetSecureTransactionRoot")!;
        var localAppData = Path.GetFullPath(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData));
        True(Path.GetFullPath(root).StartsWith(localAppData + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase), "secure transaction root escaped LocalAppData");

        var workingDirectory = (string)Invoke("CreateSecureWorkingDirectory", "cleanup-test")!;
        var target = Directory.CreateDirectory(Path.Combine(scope.Path, "junction-target")).FullName;
        File.WriteAllText(Path.Combine(target, "victim.txt"), "survive");
        var junction = Path.Combine(workingDirectory, "unsafe-junction");
        CreateJunction(junction, target);
        Invoke("TryDeleteDirectory", workingDirectory);
        True(Directory.Exists(workingDirectory), "cleanup followed or deleted a reparse-containing transaction");
        True(File.Exists(Path.Combine(target, "victim.txt")), "cleanup deleted data through a reparse point");

        Directory.Delete(junction);
        Invoke("TryDeleteDirectory", workingDirectory);
        True(!Directory.Exists(workingDirectory), "safe transaction cleanup did not remove its working directory");

        var ancestorTarget = Directory.CreateDirectory(Path.Combine(scope.Path, "ancestor-target")).FullName;
        var ancestorLink = Path.Combine(scope.Path, "ancestor-link");
        CreateJunction(ancestorLink, ancestorTarget);
        try
        {
            ExpectUpdaterFailure("EnsureSecureDirectoryPath", scope.Path, new[] { "ancestor-link", "child" });
        }
        finally
        {
            if (Directory.Exists(ancestorLink)) Directory.Delete(ancestorLink);
        }
    }

    private static void AtomicMetadataReplacementLeavesNoTemporaryFiles()
    {
        using var scope = new TemporaryDirectory();
        var destination = Path.Combine(scope.Path, ".nexplay-updater-release.json");
        Invoke("AtomicWriteAllText", destination, "first");
        Invoke("AtomicWriteAllText", destination, "second");
        Equal("second", File.ReadAllText(destination), "atomic metadata contents");
        Equal(0, Directory.EnumerateFiles(scope.Path, "*.tmp").Count(), "temporary metadata files");
    }

    private static void PerInstallMutexRejectsConcurrentWorker()
    {
        using var scope = new TemporaryDirectory();
        using var firstLease = (IDisposable)Invoke("AcquireInstallMutex", scope.Path)!;
        var rejected = Task.Run(() =>
        {
            try
            {
                using var unexpectedLease = (IDisposable)Invoke("AcquireInstallMutex", scope.Path)!;
                return false;
            }
            catch (InvalidOperationException)
            {
                return true;
            }
        }).GetAwaiter().GetResult();
        True(rejected, "a concurrent worker acquired the same per-install mutex");
    }

    private static void GracefulCloseSelectsEarliestMainProcessFirst()
    {
        using var first = StartDisposableProcess();
        Thread.Sleep(150);
        using var second = StartDisposableProcess();
        try
        {
            var selected = (Process[])Invoke("SelectGracefulCloseCandidates", (object)new[] { second, first })!;
            Equal(1, selected.Length, "graceful close candidate count");
            Equal(first.Id, selected[0].Id, "earliest main-process fallback");
        }
        finally
        {
            TryKill(first);
            TryKill(second);
        }
    }

    private static void BackupRestoreReturnsExactPreviousFiles()
    {
        using var scope = new TemporaryDirectory();
        var install = Directory.CreateDirectory(Path.Combine(scope.Path, "install")).FullName;
        File.WriteAllText(Path.Combine(install, "NexPlay.exe"), "old executable");
        Directory.CreateDirectory(Path.Combine(install, "resources"));
        File.WriteAllText(Path.Combine(install, "resources", "app.asar"), "old asar");

        var rollback = (string)Invoke("CreateRollbackBackup", install)!;
        try
        {
            File.WriteAllText(Path.Combine(install, "NexPlay.exe"), "new executable");
            File.Delete(Path.Combine(install, "resources", "app.asar"));
            File.WriteAllText(Path.Combine(install, "new-file.txt"), "new");
            Invoke("RestoreRollbackBackup", rollback, install);

            Equal("old executable", File.ReadAllText(Path.Combine(install, "NexPlay.exe")), "restored executable");
            Equal("old asar", File.ReadAllText(Path.Combine(install, "resources", "app.asar")), "restored app.asar");
            True(!File.Exists(Path.Combine(install, "new-file.txt")), "rollback left a new update file behind");
        }
        finally
        {
            if (Directory.Exists(rollback)) Directory.Delete(rollback, recursive: true);
        }
    }

    private static void FailedRollbackPreservesRecoveryBackup()
    {
        var rollback = (string)Invoke("CreateSecureWorkingDirectory", "rollback-preservation-test")!;
        File.WriteAllText(Path.Combine(rollback, "NexPlay.exe"), "recoverable");
        try
        {
            Invoke("CleanupRollbackBackup", rollback, true);
            True(Directory.Exists(rollback), "a failed rollback deleted its only recovery backup");
            Equal("recoverable", File.ReadAllText(Path.Combine(rollback, "NexPlay.exe")), "preserved recovery backup");
        }
        finally
        {
            if (Directory.Exists(rollback)) Directory.Delete(rollback, recursive: true);
        }
    }

    private static void ApplyingJournalRecoversAfterSimulatedCrash()
    {
        using var scope = new TemporaryDirectory();
        var install = Directory.CreateDirectory(Path.Combine(scope.Path, "install")).FullName;
        File.WriteAllText(Path.Combine(install, "NexPlay.exe"), "old executable");
        Directory.CreateDirectory(Path.Combine(install, "resources"));
        File.WriteAllText(Path.Combine(install, "resources", "app.asar"), "old asar");

        var transaction = (UpdateTransactionContext)Invoke("BeginUpdateTransaction", install, false)!;
        Invoke("SetUpdateTransactionState", transaction, "applying");
        File.WriteAllText(Path.Combine(install, "NexPlay.exe"), "partially updated executable");
        File.Delete(Path.Combine(install, "resources", "app.asar"));
        File.WriteAllText(Path.Combine(install, "new-only.txt"), "partial");

        True(File.Exists(transaction.JournalPath), "durable transaction journal was not written");
        True(File.ReadAllText(transaction.JournalPath).Contains("applying", StringComparison.OrdinalIgnoreCase), "applying state was not durable before mutation");
        Equal(true, (bool)Invoke("HasOrphanedUpdateTransaction", install)!, "orphan transaction discovery");
        var options = UpdaterOptions.Parse(new[] { "--silent", "--no-ui", "--no-relaunch" });
        Equal(true, (bool)Invoke("RecoverOrphanedUpdateTransactions", install, options, null)!, "orphan recovery result");

        Equal("old executable", File.ReadAllText(Path.Combine(install, "NexPlay.exe")), "recovered executable");
        Equal("old asar", File.ReadAllText(Path.Combine(install, "resources", "app.asar")), "recovered app.asar");
        True(!File.Exists(Path.Combine(install, "new-only.txt")), "orphan recovery left a partial update file");
        True(!Directory.Exists(transaction.DirectoryPath), "completed orphan recovery left transaction data behind");
    }

    private static void FailedOrphanRecoveryPreservesDurableBackup()
    {
        using var scope = new TemporaryDirectory();
        var install = Directory.CreateDirectory(Path.Combine(scope.Path, "install")).FullName;
        File.WriteAllText(Path.Combine(install, "NexPlay.exe"), "old executable");
        var transaction = (UpdateTransactionContext)Invoke("BeginUpdateTransaction", install, false)!;
        Invoke("SetUpdateTransactionState", transaction, "applying");
        File.WriteAllText(Path.Combine(transaction.BackupDirectory, "NexPlay.exe"), "corrupt backup");
        File.WriteAllText(Path.Combine(install, "NexPlay.exe"), "partial update");
        var options = UpdaterOptions.Parse(new[] { "--silent", "--no-ui", "--no-relaunch" });
        try
        {
            ExpectUpdaterFailure("RecoverOrphanedUpdateTransactions", install, options, null);
            True(Directory.Exists(transaction.DirectoryPath), "failed recovery deleted its transaction directory");
            True(File.Exists(transaction.JournalPath), "failed recovery deleted its durable journal");
            Equal("corrupt backup", File.ReadAllText(Path.Combine(transaction.BackupDirectory, "NexPlay.exe")), "failed recovery backup preservation");
        }
        finally
        {
            if (Directory.Exists(transaction.DirectoryPath)) Directory.Delete(transaction.DirectoryPath, recursive: true);
        }
    }

    private static void PostCommitLaunchFailureDoesNotThrow()
    {
        using var scope = new TemporaryDirectory();
        var result = (bool)Invoke("TryLaunchAfterCommittedOperation", scope.Path, false, new ThrowingUpdaterUi(), "update")!;
        Equal(false, result, "post-commit launch failure result");
    }

    private static void SuccessfulInstallCommitsAndRemovesBackup()
    {
        using var scope = new TemporaryDirectory();
        var install = Directory.CreateDirectory(Path.Combine(scope.Path, "install")).FullName;
        var source = Directory.CreateDirectory(Path.Combine(scope.Path, "source")).FullName;
        CreateValidPayload(install, "old");
        CreateValidPayload(source, "new");
        File.WriteAllText(Path.Combine(source, "new-only.txt"), "new-only");
        var rollbackRoot = (string)Invoke("GetSecureTransactionRoot")!;
        var before = Directory.Exists(rollbackRoot)
            ? Directory.EnumerateDirectories(rollbackRoot, "transaction-*").ToHashSet(StringComparer.OrdinalIgnoreCase)
            : new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        var exitCode = UpdateLauncher.Run(new[]
        {
            "--silent",
            "--no-relaunch",
            "--source", source,
            "--install-dir", install
        });

        Equal(0, exitCode, "successful update exit code");
        Equal("new:NexPlay.exe", File.ReadAllText(Path.Combine(install, "NexPlay.exe")), "committed executable");
        True(File.Exists(Path.Combine(install, ".nexplay-updater-manifest.txt")), "successful update did not write its installed manifest");
        True(File.ReadAllText(Path.Combine(install, ".nexplay-updater-manifest.txt")).Contains("new-only.txt", StringComparison.OrdinalIgnoreCase), "installed manifest omitted a new file");
        var after = Directory.Exists(rollbackRoot)
            ? Directory.EnumerateDirectories(rollbackRoot, "transaction-*").ToHashSet(StringComparer.OrdinalIgnoreCase)
            : new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        True(after.SetEquals(before), "successful update left a rollback backup behind");
    }

    private static void FailedInstallRollsBackCompleteDirectory()
    {
        using var scope = new TemporaryDirectory();
        var install = Directory.CreateDirectory(Path.Combine(scope.Path, "install")).FullName;
        var source = Directory.CreateDirectory(Path.Combine(scope.Path, "source")).FullName;
        CreateValidPayload(install, "old");
        CreateValidPayload(source, "new");
        File.WriteAllText(Path.Combine(source, "new-only.txt"), "new-only");
        Directory.CreateDirectory(Path.Combine(install, ".nexplay-updater-manifest.txt"));

        var exitCode = UpdateLauncher.Run(new[]
        {
            "--silent",
            "--no-relaunch",
            "--source", source,
            "--install-dir", install
        });

        Equal(1, exitCode, "forced metadata failure exit code");
        Equal("old:NexPlay.exe", File.ReadAllText(Path.Combine(install, "NexPlay.exe")), "transaction restored old executable");
        Equal("old:resources/app.asar", File.ReadAllText(Path.Combine(install, "resources", "app.asar")), "transaction restored old app.asar");
        True(!File.Exists(Path.Combine(install, "new-only.txt")), "failed transaction left a new file behind");
        True(Directory.Exists(Path.Combine(install, ".nexplay-updater-manifest.txt")), "failed transaction did not restore the original metadata directory");
    }

    private static void CreateValidPayload(string root, string marker)
    {
        var required = new[]
        {
            "NexPlay.exe",
            "chrome_100_percent.pak",
            "chrome_200_percent.pak",
            "icudtl.dat",
            "resources.pak",
            "v8_context_snapshot.bin",
            "resources/app.asar",
            "locales/en-US.pak"
        };
        foreach (var relative in required)
        {
            WritePayloadFile(root, relative, $"{marker}:{relative}");
        }
        for (var index = 0; index < 12; index++)
        {
            WritePayloadFile(root, $"locales/locale-{index:00}.pak", $"{marker}:locale:{index}");
        }
        for (var index = 0; index < 25; index++)
        {
            WritePayloadFile(root, $"resources/fixture-{index:00}.bin", $"{marker}:fixture:{index}");
        }
    }

    private static void WritePayloadFile(string root, string relativePath, string contents)
    {
        var path = Path.Combine(root, relativePath.Replace('/', Path.DirectorySeparatorChar));
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, contents);
    }

    private static void CreateJunction(string junctionPath, string targetPath)
    {
        using var process = Process.Start(new ProcessStartInfo
        {
            FileName = "cmd.exe",
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            ArgumentList = { "/d", "/c", "mklink", "/J", junctionPath, targetPath }
        }) ?? throw new InvalidOperationException("Could not create a disposable junction for the safety test.");
        process.WaitForExit();
        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException($"Could not create the disposable junction: {process.StandardError.ReadToEnd()}");
        }
    }

    private static Process StartDisposableProcess()
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            UseShellExecute = false,
            CreateNoWindow = true
        };
        startInfo.ArgumentList.Add("-NoProfile");
        startInfo.ArgumentList.Add("-Command");
        startInfo.ArgumentList.Add("Start-Sleep -Seconds 30");
        return Process.Start(startInfo) ?? throw new InvalidOperationException("Could not start a disposable process for shutdown-order testing.");
    }

    private static void TryKill(Process process)
    {
        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
                process.WaitForExit(5000);
            }
        }
        catch
        {
            // The test process may have exited between inspection and cleanup.
        }
    }

    private static object? Invoke(string methodName, params object?[] arguments)
    {
        var methods = LauncherType.GetMethods(BindingFlags.Static | BindingFlags.NonPublic)
            .Where(method => method.Name == methodName && method.GetParameters().Length == arguments.Length)
            .ToArray();
        if (methods.Length != 1) throw new InvalidOperationException($"Could not uniquely resolve updater method {methodName}.");
        try
        {
            return methods[0].Invoke(null, arguments);
        }
        catch (TargetInvocationException ex) when (ex.InnerException is not null)
        {
            throw ex.InnerException;
        }
    }

    private static void ExpectUpdaterFailure(string methodName, params object?[] arguments)
    {
        try
        {
            Invoke(methodName, arguments);
        }
        catch (InvalidOperationException)
        {
            return;
        }
        throw new InvalidOperationException($"Expected {methodName} to reject unsafe input.");
    }

    private static void True(bool value, string message)
    {
        if (!value) throw new InvalidOperationException(message);
    }

    private static void Equal<T>(T expected, T actual, string label)
    {
        if (!EqualityComparer<T>.Default.Equals(expected, actual))
        {
            throw new InvalidOperationException($"{label}: expected {expected}, got {actual}");
        }
    }

    private sealed class TemporaryDirectory : IDisposable
    {
        public string Path { get; } = System.IO.Path.Combine(
            System.IO.Path.GetTempPath(),
            "NexPlayUpdaterSafetyTests",
            Guid.NewGuid().ToString("N"));

        public TemporaryDirectory() => Directory.CreateDirectory(Path);

        public void Dispose()
        {
            try
            {
                if (Directory.Exists(Path)) Directory.Delete(Path, recursive: true);
            }
            catch
            {
                // Test failures retain their primary assertion.
            }
        }
    }

    private sealed class ThrowingUpdaterUi : IUpdaterUi
    {
        public void Report(string title, string detail, int progress) { }
        public bool Confirm(string title, string detail, string confirmText, string cancelText, int progress) => true;
        public bool CompleteAndAskLaunch(string title, string detail, string launchText, string closeText) => true;
        public void MessageAndWait(string title, string detail, bool isError) => throw new InvalidOperationException("notification failed");
        public void FailAndWait(string title, string detail) => throw new InvalidOperationException("notification failed");
    }
}
