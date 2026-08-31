using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO.Compression;
using System.Net;
using System.Security.Principal;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace NexPlayUpdater;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        try
        {
            var options = UpdaterOptions.Parse(args);
            if (!options.Silent && !options.NoUi)
            {
                using var window = new UpdaterWindow(args);
                Application.Run(window);
                return window.ExitCode;
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                ex.Message,
                "NexPlay Updater",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return 1;
        }

        return UpdateLauncher.Run(args);
    }
}

internal interface IUpdaterUi
{
    void Report(string title, string detail, int progress);
    bool Confirm(string title, string detail, string confirmText, string cancelText, int progress);
    bool CompleteAndAskLaunch(string title, string detail, string launchText, string closeText);
    void MessageAndWait(string title, string detail, bool isError);
    void FailAndWait(string title, string detail);
}

internal sealed class UpdaterWindow : Form, IUpdaterUi
{
    private static readonly Color AppBackground = Color.FromArgb(4, 5, 8);
    private static readonly Color PanelFill = Color.FromArgb(10, 10, 12);
    private static readonly Color PanelFillAlt = Color.FromArgb(12, 16, 26);
    private static readonly Color BorderSubtle = Color.FromArgb(34, 255, 255, 255);
    private static readonly Color TextMuted = Color.FromArgb(148, 163, 184);
    private static readonly Color TextSoft = Color.FromArgb(203, 213, 225);
    private static readonly Color BrandCyan = Color.FromArgb(19, 224, 255);
    private static readonly Color BrandCyanSoft = Color.FromArgb(186, 230, 253);
    private static readonly Color BrandTeal = Color.FromArgb(45, 212, 191);
    private static readonly Color BrandGreen = Color.FromArgb(187, 247, 208);
    private static readonly Color BrandAmber = Color.FromArgb(254, 240, 138);
    private static readonly Color BrandViolet = Color.FromArgb(168, 85, 247);

    private readonly string[] _args;
    private readonly Label _headline = new();
    private readonly Label _detail = new();
    private readonly Label _progressLabel = new();
    private readonly Label _statusBadge = new();
    private readonly Panel _progressTrack = new();
    private readonly Panel _progressFill = new();
    private readonly Label[] _stepLabels = { new(), new(), new(), new() };
    private readonly TextBox _log = new();
    private readonly Button _primaryButton = new();
    private readonly Button _secondaryButton = new();
    private Action? _primaryAction;
    private Action? _secondaryAction;
    private int _currentProgress;
    private bool _runStarted;
    private bool _canClose;

    private static readonly string[] StepNames = { "CHECK", "DOWNLOAD", "INSTALL", "FINISH" };
    private static readonly int[] StepThresholds = { 18, 52, 84, 100 };

    public int ExitCode { get; private set; } = 1;

    public UpdaterWindow(string[] args)
    {
        _args = args.ToArray();
        BuildUi();
    }

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        if (_runStarted)
        {
            return;
        }

        _runStarted = true;
        Task.Run(() =>
        {
            ExitCode = UpdateLauncher.RunWithUi(_args, this);
            RunOnUi(() =>
            {
                _canClose = true;
                Close();
            });
        });
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (!_canClose)
        {
            if (_secondaryAction is not null)
            {
                _secondaryAction.Invoke();
            }

            e.Cancel = true;
            return;
        }

        base.OnFormClosing(e);
    }

    public void Report(string title, string detail, int progress)
    {
        RunOnUi(() =>
        {
            UseWaitCursor = true;
            _statusBadge.Text = "WORKING";
            _statusBadge.ForeColor = BrandCyanSoft;
            _statusBadge.BackColor = Color.FromArgb(17, 36, 55);
            _headline.Text = title;
            _detail.Text = detail;
            SetProgress(progress);
            _primaryButton.Visible = false;
            _secondaryButton.Visible = false;
            AppendLog(title, detail);
        });
    }

    public bool Confirm(string title, string detail, string confirmText, string cancelText, int progress)
    {
        return WaitForChoice(title, detail, confirmText, cancelText, progress, true);
    }

    public bool CompleteAndAskLaunch(string title, string detail, string launchText, string closeText)
    {
        return WaitForChoice(title, detail, launchText, closeText, 100, true);
    }

    public void MessageAndWait(string title, string detail, bool isError)
    {
        WaitForChoice(title, detail, "Close", string.Empty, isError ? 0 : 100, false);
    }

    public void FailAndWait(string title, string detail)
    {
        WaitForChoice(title, detail, "Close", string.Empty, 0, false);
    }

    private void BuildUi()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
        Text = "NexPlay Updater";
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        MinimizeBox = true;
        ControlBox = true;
        ClientSize = new Size(820, 560);
        BackColor = AppBackground;
        ForeColor = Color.White;
        Font = new Font("Segoe UI", 9F, FontStyle.Regular, GraphicsUnit.Point);
        try
        {
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        }
        catch
        {
        }

        var shell = new Panel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(28),
            BackColor = BackColor
        };
        Controls.Add(shell);

        var topGlow = new AccentStrip
        {
            Location = new Point(0, 0),
            Size = new Size(ClientSize.Width, 3),
            Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right
        };
        shell.Controls.Add(topGlow);

        var logo = new BrandMark
        {
            Location = new Point(30, 28),
            Size = new Size(50, 50)
        };
        shell.Controls.Add(logo);

        var brand = new Label
        {
            Text = "NEXPLAY",
            Location = new Point(94, 25),
            Size = new Size(260, 32),
            BackColor = AppBackground,
            ForeColor = Color.White,
            Font = new Font("Segoe UI Black", 20F, FontStyle.Bold, GraphicsUnit.Point)
        };
        shell.Controls.Add(brand);

        var caption = new Label
        {
            Text = "HYPERION UPDATE CHANNEL",
            Location = new Point(96, 58),
            Size = new Size(280, 22),
            BackColor = AppBackground,
            ForeColor = TextMuted,
            Font = new Font("Consolas", 8.5F, FontStyle.Bold, GraphicsUnit.Point)
        };
        shell.Controls.Add(caption);

        var desktopBadge = CreateBadge("DESKTOP APP", new Point(558, 32), new Size(118, 28), BrandCyanSoft, Color.FromArgb(18, 38, 58));
        shell.Controls.Add(desktopBadge);

        _statusBadge.Text = "READY";
        _statusBadge.Location = new Point(686, 32);
        _statusBadge.Size = new Size(104, 28);
        _statusBadge.TextAlign = ContentAlignment.MiddleCenter;
        _statusBadge.ForeColor = BrandGreen;
        _statusBadge.BackColor = Color.FromArgb(20, 44, 34);
        _statusBadge.Font = new Font("Segoe UI Semibold", 8F, FontStyle.Bold, GraphicsUnit.Point);
        shell.Controls.Add(_statusBadge);

        var brandRail = new HoloPanel
        {
            Location = new Point(30, 98),
            Size = new Size(190, 348),
            FillColor = PanelFill,
            BorderColor = BorderSubtle,
            Radius = 24
        };
        shell.Controls.Add(brandRail);

        var railTitle = new Label
        {
            Text = "NEXPLAY",
            Location = new Point(22, 28),
            Size = new Size(142, 32),
            BackColor = PanelFill,
            ForeColor = Color.White,
            Font = new Font("Segoe UI Black", 18F, FontStyle.Bold, GraphicsUnit.Point)
        };
        brandRail.Controls.Add(railTitle);

        var railSubtitle = new Label
        {
            Text = "UPDATE MANAGER",
            Location = new Point(24, 62),
            Size = new Size(140, 22),
            BackColor = PanelFill,
            ForeColor = BrandCyanSoft,
            Font = new Font("Consolas", 8.5F, FontStyle.Bold, GraphicsUnit.Point)
        };
        brandRail.Controls.Add(railSubtitle);

        var railCopy = new Label
        {
            Text = "Official Windows release channel for the NexPlay desktop app.",
            Location = new Point(24, 108),
            Size = new Size(138, 66),
            BackColor = PanelFill,
            ForeColor = TextSoft,
            Font = new Font("Segoe UI", 9F, FontStyle.Regular, GraphicsUnit.Point)
        };
        brandRail.Controls.Add(railCopy);

        var railDivider = new Panel
        {
            Location = new Point(24, 194),
            Size = new Size(138, 1),
            BackColor = Color.FromArgb(36, 255, 255, 255)
        };
        brandRail.Controls.Add(railDivider);

        var railPillOne = CreateBadge("SIGNED PAYLOAD", new Point(24, 222), new Size(138, 28), BrandGreen, Color.FromArgb(16, 45, 37));
        var railPillTwo = CreateBadge("APP.ASAR READY", new Point(24, 262), new Size(138, 28), BrandCyanSoft, Color.FromArgb(14, 39, 61));
        brandRail.Controls.Add(railPillOne);
        brandRail.Controls.Add(railPillTwo);

        var surface = new HoloPanel
        {
            Location = new Point(240, 98),
            Size = new Size(550, 348),
            FillColor = PanelFillAlt,
            BorderColor = BorderSubtle,
            Radius = 24,
            AccentColor = BrandCyan
        };
        shell.Controls.Add(surface);

        _headline.Location = new Point(28, 28);
        _headline.Size = new Size(488, 42);
        _headline.BackColor = PanelFillAlt;
        _headline.ForeColor = Color.White;
        _headline.Font = new Font("Segoe UI Black", 17F, FontStyle.Bold, GraphicsUnit.Point);
        _headline.Text = "Preparing updater";
        surface.Controls.Add(_headline);

        _detail.Location = new Point(30, 78);
        _detail.Size = new Size(490, 62);
        _detail.BackColor = PanelFillAlt;
        _detail.ForeColor = TextSoft;
        _detail.Font = new Font("Segoe UI", 10F, FontStyle.Regular, GraphicsUnit.Point);
        _detail.Text = "Starting NexPlay update checks.";
        surface.Controls.Add(_detail);

        _progressTrack.Location = new Point(30, 154);
        _progressTrack.Size = new Size(418, 14);
        _progressTrack.BackColor = Color.FromArgb(28, 37, 56);
        _progressTrack.Resize += (_, _) => SetProgress(_currentProgress);
        surface.Controls.Add(_progressTrack);

        _progressFill.Location = new Point(0, 0);
        _progressFill.Size = new Size(0, 14);
        _progressFill.BackColor = BrandCyan;
        _progressTrack.Controls.Add(_progressFill);

        _progressLabel.Location = new Point(462, 144);
        _progressLabel.Size = new Size(58, 30);
        _progressLabel.TextAlign = ContentAlignment.MiddleRight;
        _progressLabel.BackColor = PanelFillAlt;
        _progressLabel.ForeColor = BrandCyan;
        _progressLabel.Font = new Font("Segoe UI Semibold", 11F, FontStyle.Bold, GraphicsUnit.Point);
        _progressLabel.Text = "0%";
        surface.Controls.Add(_progressLabel);

        for (var index = 0; index < _stepLabels.Length; index++)
        {
            var step = _stepLabels[index];
            step.Text = StepNames[index];
            step.Location = new Point(30 + (index * 122), 190);
            step.Size = new Size(108, 27);
            step.TextAlign = ContentAlignment.MiddleCenter;
            step.BackColor = Color.FromArgb(20, 27, 42);
            step.ForeColor = TextMuted;
            step.Font = new Font("Segoe UI Semibold", 8F, FontStyle.Bold, GraphicsUnit.Point);
            surface.Controls.Add(step);
        }

        var activityLabel = new Label
        {
            Text = "UPDATE ACTIVITY",
            Location = new Point(30, 238),
            Size = new Size(120, 20),
            BackColor = PanelFillAlt,
            ForeColor = Color.FromArgb(226, 232, 240),
            Font = new Font("Segoe UI Semibold", 8.5F, FontStyle.Bold, GraphicsUnit.Point)
        };
        surface.Controls.Add(activityLabel);

        _log.Location = new Point(30, 264);
        _log.Size = new Size(490, 54);
        _log.Multiline = true;
        _log.ReadOnly = true;
        _log.ScrollBars = ScrollBars.Vertical;
        _log.BorderStyle = BorderStyle.FixedSingle;
        _log.BackColor = Color.FromArgb(5, 8, 14);
        _log.ForeColor = Color.FromArgb(156, 178, 211);
        _log.Font = new Font("Consolas", 8.5F, FontStyle.Regular, GraphicsUnit.Point);
        surface.Controls.Add(_log);

        var footerLabel = new Label
        {
            Text = "NEXPLAY DESKTOP RUNTIME",
            Location = new Point(32, 480),
            Size = new Size(240, 22),
            BackColor = AppBackground,
            ForeColor = TextMuted,
            Font = new Font("Consolas", 8.5F, FontStyle.Bold, GraphicsUnit.Point)
        };
        shell.Controls.Add(footerLabel);

        _secondaryButton.Location = new Point(500, 474);
        _secondaryButton.Size = new Size(132, 42);
        ApplySecondaryButtonStyle(_secondaryButton);
        _secondaryButton.Visible = false;
        _secondaryButton.Click += (_, _) => _secondaryAction?.Invoke();
        shell.Controls.Add(_secondaryButton);

        _primaryButton.Location = new Point(646, 474);
        _primaryButton.Size = new Size(144, 42);
        ApplyPrimaryButtonStyle(_primaryButton);
        _primaryButton.Visible = false;
        _primaryButton.Click += (_, _) => _primaryAction?.Invoke();
        shell.Controls.Add(_primaryButton);

        SetProgress(0);
    }

    private static Label CreateBadge(string text, Point location, Size size, Color foreColor, Color backColor)
    {
        return new Label
        {
            Text = text,
            Location = location,
            Size = size,
            BackColor = backColor,
            ForeColor = foreColor,
            TextAlign = ContentAlignment.MiddleCenter,
            Font = new Font("Segoe UI Semibold", 7.5F, FontStyle.Bold, GraphicsUnit.Point)
        };
    }

    private static void ApplyPrimaryButtonStyle(Button button)
    {
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderSize = 0;
        button.FlatAppearance.MouseOverBackColor = Color.FromArgb(73, 232, 255);
        button.FlatAppearance.MouseDownBackColor = Color.FromArgb(103, 232, 249);
        button.BackColor = BrandCyan;
        button.ForeColor = Color.FromArgb(3, 8, 15);
        button.Font = new Font("Segoe UI Semibold", 8.5F, FontStyle.Bold, GraphicsUnit.Point);
        button.Cursor = Cursors.Hand;
        button.AutoEllipsis = true;
    }

    private static void ApplySecondaryButtonStyle(Button button)
    {
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderColor = Color.FromArgb(74, 85, 110);
        button.FlatAppearance.MouseOverBackColor = Color.FromArgb(28, 36, 54);
        button.FlatAppearance.MouseDownBackColor = Color.FromArgb(38, 49, 72);
        button.BackColor = Color.FromArgb(16, 22, 36);
        button.ForeColor = Color.FromArgb(218, 226, 242);
        button.Font = new Font("Segoe UI Semibold", 8.5F, FontStyle.Bold, GraphicsUnit.Point);
        button.Cursor = Cursors.Hand;
        button.AutoEllipsis = true;
    }

    private bool WaitForChoice(
        string title,
        string detail,
        string primaryText,
        string secondaryText,
        int progress,
        bool hasNegativeChoice)
    {
        using var wait = new ManualResetEventSlim(false);
        var result = false;

        RunOnUi(() =>
        {
            UseWaitCursor = false;
            _statusBadge.Text = hasNegativeChoice ? "ACTION NEEDED" : "READY";
            _statusBadge.ForeColor = hasNegativeChoice
                ? BrandAmber
                : BrandGreen;
            _statusBadge.BackColor = hasNegativeChoice
                ? Color.FromArgb(66, 48, 18)
                : Color.FromArgb(20, 44, 34);
            _headline.Text = title;
            _detail.Text = detail;
            SetProgress(progress);
            AppendLog(title, detail);

            _primaryButton.Text = FormatButtonLabel(primaryText);
            _primaryButton.Enabled = true;
            _primaryButton.Visible = true;
            _primaryAction = () =>
            {
                _primaryButton.Enabled = false;
                _secondaryButton.Enabled = false;
                result = true;
                wait.Set();
            };

            if (hasNegativeChoice && !string.IsNullOrWhiteSpace(secondaryText))
            {
                _secondaryButton.Text = FormatButtonLabel(secondaryText);
                _secondaryButton.Enabled = true;
                _secondaryButton.Visible = true;
                _secondaryAction = () =>
                {
                    _primaryButton.Enabled = false;
                    _secondaryButton.Enabled = false;
                    result = false;
                    wait.Set();
                };
            }
            else
            {
                _secondaryButton.Visible = false;
                _secondaryAction = null;
            }
        });

        wait.Wait();

        RunOnUi(() =>
        {
            _primaryButton.Visible = false;
            _secondaryButton.Visible = false;
            _primaryAction = null;
            _secondaryAction = null;
        });

        return result;
    }

    private void SetProgress(int progress)
    {
        _currentProgress = Math.Clamp(progress, 0, 100);
        _progressLabel.Text = $"{_currentProgress}%";

        if (_progressTrack.ClientSize.Width > 0)
        {
            var fillWidth = (int)Math.Round(_progressTrack.ClientSize.Width * (_currentProgress / 100d));
            _progressFill.Width = _currentProgress > 0
                ? Math.Max(8, fillWidth)
                : 0;
            _progressFill.Height = _progressTrack.ClientSize.Height;
        }

        UpdateStepStyles(_currentProgress);
    }

    private void UpdateStepStyles(int progress)
    {
        for (var index = 0; index < _stepLabels.Length; index++)
        {
            var completed = progress >= StepThresholds[index];
            var active = !completed && (index == 0 || progress >= StepThresholds[index - 1]);
            var label = _stepLabels[index];

            label.BackColor = completed
                ? Color.FromArgb(17, 94, 89)
                : active
                    ? Color.FromArgb(20, 45, 72)
                    : Color.FromArgb(20, 27, 42);
            label.ForeColor = completed
                ? Color.FromArgb(204, 251, 241)
                : active
                    ? BrandCyanSoft
                    : TextMuted;
        }
    }

    private static string FormatButtonLabel(string value)
    {
        return string.IsNullOrWhiteSpace(value)
            ? string.Empty
            : value.Trim().ToUpperInvariant();
    }

    private void AppendLog(string title, string detail)
    {
        var cleanDetail = string.IsNullOrWhiteSpace(detail)
            ? string.Empty
            : " - " + detail.Replace(Environment.NewLine, " ");
        _log.AppendText($"[{DateTime.Now:HH:mm:ss}] {title}{cleanDetail}{Environment.NewLine}");
    }

    private void RunOnUi(Action action)
    {
        if (IsDisposed)
        {
            return;
        }

        if (InvokeRequired)
        {
            Invoke(action);
            return;
        }

        action();
    }
}

internal sealed class HoloPanel : Panel
{
    public Color FillColor { get; set; } = Color.FromArgb(12, 16, 26);
    public Color BorderColor { get; set; } = Color.FromArgb(34, 255, 255, 255);
    public Color AccentColor { get; set; } = Color.Empty;
    public int Radius { get; set; } = 18;

    public HoloPanel()
    {
        DoubleBuffered = true;
        ResizeRedraw = true;
        BackColor = Color.FromArgb(4, 5, 8);
    }

    protected override void OnPaintBackground(PaintEventArgs e)
    {
        using var brush = new SolidBrush(Parent?.BackColor ?? Color.FromArgb(4, 5, 8));
        e.Graphics.FillRectangle(brush, ClientRectangle);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        var bounds = new Rectangle(0, 0, Width - 1, Height - 1);
        using var path = CreateRoundRectangle(bounds, Radius);
        using var fill = new SolidBrush(FillColor);
        e.Graphics.FillPath(fill, path);

        if (AccentColor != Color.Empty)
        {
            using var accent = new LinearGradientBrush(
                new Rectangle(0, 0, Math.Max(1, Width), 6),
                AccentColor,
                Color.FromArgb(168, 85, 247),
                LinearGradientMode.Horizontal);
            e.Graphics.FillRectangle(accent, new Rectangle(1, 1, Math.Max(1, Width - 2), 5));
        }

        using var border = new Pen(BorderColor, 1F);
        e.Graphics.DrawPath(border, path);
    }

    private static GraphicsPath CreateRoundRectangle(Rectangle bounds, int radius)
    {
        var diameter = Math.Max(1, radius * 2);
        var path = new GraphicsPath();
        if (radius <= 0)
        {
            path.AddRectangle(bounds);
            path.CloseFigure();
            return path;
        }

        path.AddArc(bounds.Left, bounds.Top, diameter, diameter, 180, 90);
        path.AddArc(bounds.Right - diameter, bounds.Top, diameter, diameter, 270, 90);
        path.AddArc(bounds.Right - diameter, bounds.Bottom - diameter, diameter, diameter, 0, 90);
        path.AddArc(bounds.Left, bounds.Bottom - diameter, diameter, diameter, 90, 90);
        path.CloseFigure();
        return path;
    }
}

internal sealed class BrandMark : Control
{
    public BrandMark()
    {
        DoubleBuffered = true;
        ResizeRedraw = true;
        BackColor = Color.FromArgb(4, 5, 8);
    }

    protected override void OnPaintBackground(PaintEventArgs e)
    {
        using var brush = new SolidBrush(Parent?.BackColor ?? Color.FromArgb(4, 5, 8));
        e.Graphics.FillRectangle(brush, ClientRectangle);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        var bounds = new Rectangle(0, 0, Width - 1, Height - 1);
        using var path = CreateRoundRectangle(bounds, 14);
        using var fill = new LinearGradientBrush(bounds, Color.White, Color.FromArgb(19, 224, 255), LinearGradientMode.ForwardDiagonal);
        e.Graphics.FillPath(fill, path);
        using var border = new Pen(Color.FromArgb(88, 255, 255, 255), 1F);
        e.Graphics.DrawPath(border, path);

        using var font = new Font("Segoe UI Black", Math.Max(18F, Height * 0.42F), FontStyle.Bold, GraphicsUnit.Point);
        TextRenderer.DrawText(
            e.Graphics,
            "N",
            font,
            ClientRectangle,
            Color.FromArgb(2, 8, 14),
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
    }

    private static GraphicsPath CreateRoundRectangle(Rectangle bounds, int radius)
    {
        var diameter = Math.Max(1, radius * 2);
        var path = new GraphicsPath();
        path.AddArc(bounds.Left, bounds.Top, diameter, diameter, 180, 90);
        path.AddArc(bounds.Right - diameter, bounds.Top, diameter, diameter, 270, 90);
        path.AddArc(bounds.Right - diameter, bounds.Bottom - diameter, diameter, diameter, 0, 90);
        path.AddArc(bounds.Left, bounds.Bottom - diameter, diameter, diameter, 90, 90);
        path.CloseFigure();
        return path;
    }
}

internal sealed class AccentStrip : Control
{
    public AccentStrip()
    {
        DoubleBuffered = true;
        ResizeRedraw = true;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        using var brush = new LinearGradientBrush(
            ClientRectangle,
            Color.FromArgb(19, 224, 255),
            Color.FromArgb(168, 85, 247),
            LinearGradientMode.Horizontal);
        e.Graphics.FillRectangle(brush, ClientRectangle);
    }
}

internal static class UpdateLauncher
{
    private const string ProductName = "NexPlay";
    private const string ProductExecutableName = "NexPlay.exe";
    private const string ProductProcessName = "NexPlay";
    private const string UpdaterDisplayName = "NexPlay Updater";
    private const string ManifestFileName = ".nexplay-updater-manifest.txt";
    private const string ReleaseReceiptFileName = ".nexplay-updater-release.json";
    private const string UpdateConfigFileName = "nexplay-updater.json";
    private const string UpdateConfigExampleFileName = "nexplay-updater.example.json";
    private const string TransactionJournalFileName = "transaction.json";
    private const string TransactionBackupDirectoryName = "backup";
    private const string TransactionStatePreparing = "preparing";
    private const string TransactionStateBackupReady = "backup-ready";
    private const string TransactionStateApplying = "applying";
    private const string TransactionStateCommitted = "committed";
    private const string TransactionStateRolledBack = "rolled-back";
    private const string UninstallRegistryPath = @"Software\Microsoft\Windows\CurrentVersion\Uninstall";
    private const int MinimumSourceFileCount = 40;
    private const int MinimumLocalePakCount = 10;
    private const double MinimumManifestRetentionRatio = 0.5;
    private const int NetworkTimeoutSeconds = 45;
    private static readonly StringComparer PathComparer = StringComparer.OrdinalIgnoreCase;
    private static readonly string LogPath = Path.Combine(Path.GetTempPath(), "NexPlayUpdater.log");
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        AllowTrailingCommas = true,
        ReadCommentHandling = JsonCommentHandling.Skip
    };
    private static readonly string[] RequiredSourceFiles =
    {
        ProductExecutableName,
        "chrome_100_percent.pak",
        "chrome_200_percent.pak",
        "icudtl.dat",
        "resources.pak",
        "v8_context_snapshot.bin",
        Path.Combine("resources", "app.asar"),
        Path.Combine("locales", "en-US.pak")
    };

    public static int Run(string[] args) => RunCore(args, null);

    public static int RunWithUi(string[] args, IUpdaterUi ui) => RunCore(args, ui);

    private static int RunCore(string[] args, IUpdaterUi? ui)
    {
        UpdaterOptions? options = null;
        RemoteUpdatePlan? remoteUpdate = null;
        try
        {
            BeginLog(args);
            options = UpdaterOptions.Parse(args);
            ui?.Report("Starting updater", "Locating the installed NexPlay app.", 5);
            var installDirectory = string.Empty;
            var entry = !string.IsNullOrWhiteSpace(options.InstallDirectory)
                ? CreatePortableInstalledEntry(ResolveInstallDirectoryOption(options.InstallDirectory, "install target"))
                : FindInstalledEntry();
            if (entry is null)
            {
                installDirectory = ResolvePortableInstallDirectory(options);
                if (string.IsNullOrWhiteSpace(installDirectory))
                {
                    Log("No installed NexPlay registry entry or portable app folder was found.");
                    ShowMessage(
                        $"{ProductName} is not installed on this PC, and no portable app folder was found.{Environment.NewLine}{Environment.NewLine}Pass --install-dir <folder> to update an unpacked Windows app folder.",
                        MessageBoxIcon.Information,
                        options.Silent,
                        ui);
                    return 2;
                }

                entry = CreatePortableInstalledEntry(installDirectory);
            }

            ui?.Report("Locating NexPlay", $"Found app folder. Registry version: {FormatVersionLabel(entry.DisplayVersion)}", 10);
            if (string.IsNullOrWhiteSpace(installDirectory))
            {
                installDirectory = !string.IsNullOrWhiteSpace(options.InstallDirectory)
                    ? entry.InstallLocation
                    : ResolveInstallDirectory(entry);
            }
            Log($"Resolved install directory: {installDirectory}");

            if (HasOrphanedUpdateTransaction(installDirectory))
            {
                ui?.Report("Recovering update", "Restoring NexPlay after an interrupted update.", 8);
                var recoveryElevation = EnsureElevationIfNeeded(installDirectory, options, ui);
                if (recoveryElevation == ElevationResult.Cancelled)
                {
                    return 0;
                }
                if (recoveryElevation == ElevationResult.Relaunched)
                {
                    return 0;
                }

                using var recoveryMutex = AcquireInstallMutex(installDirectory);
                if (RecoverOrphanedUpdateTransactions(installDirectory, options, ui))
                {
                    ShowMessage(
                        "NexPlay was restored after an interrupted update. Run the updater again when you are ready to retry.",
                        MessageBoxIcon.Information,
                        options.Silent,
                        ui);
                    return 0;
                }
            }

            var sourceDirectory = string.Empty;
            var manifestUrl = string.IsNullOrWhiteSpace(options.SourceDirectory)
                ? ResolveUpdateManifestLocation(options, installDirectory)
                : null;

            if (!string.IsNullOrWhiteSpace(manifestUrl))
            {
                ui?.Report("Checking for updates", manifestUrl, 18);
                remoteUpdate = CheckRemoteUpdate(manifestUrl, entry, options, installDirectory);
                if (!remoteUpdate.UpdateAvailable)
                {
                    var installedVersionLabel = GetDisplayedInstalledVersionLabel(entry, remoteUpdate);
                    Log($"No remote update available. Installed release: {installedVersionLabel}. Latest version: {remoteUpdate.VersionLabel}. Registry version: {entry.DisplayVersion}.");
                    ShowMessage(
                        BuildUpToDateMessage(remoteUpdate, entry),
                        MessageBoxIcon.Information,
                        options.Silent,
                        ui);
                    return 0;
                }

                if (options.CheckOnly)
                {
                    Log($"Remote update available: {remoteUpdate.VersionLabel}.");
                    ShowMessage(
                        BuildRemoteUpdateAvailableMessage(remoteUpdate, entry),
                        MessageBoxIcon.Information,
                        options.Silent,
                        ui);
                    return 0;
                }

                ui?.Report("Update found", $"Version {remoteUpdate.VersionLabel} is ready to download.", 25);
                var elevationResult = EnsureElevationIfNeeded(installDirectory, options, ui);
                if (elevationResult == ElevationResult.Cancelled)
                {
                    return 0;
                }

                if (elevationResult == ElevationResult.Relaunched)
                {
                    return 0;
                }

                if (!ConfirmRemoteUpdate(remoteUpdate, entry, options, ui))
                {
                    return 0;
                }

                sourceDirectory = DownloadAndPrepareRemoteUpdate(remoteUpdate, options, ui);
                Log($"Resolved source directory: {sourceDirectory}");
                ui?.Report("Validating update", "Checking the downloaded NexPlay payload.", 58);
                ValidateDirectories(installDirectory, sourceDirectory);
            }
            else
            {
                if (options.CheckOnly)
                {
                    ShowMessage(
                        $"No update feed is configured yet.{Environment.NewLine}{Environment.NewLine}When you are ready, place {UpdateConfigFileName} next to the updater or pass --manifest-url <url>.{Environment.NewLine}{Environment.NewLine}Local development updates still work through --source.",
                        MessageBoxIcon.Information,
                        options.Silent,
                        ui);
                    return 0;
                }

                ui?.Report("Looking for local update", "No update feed is configured, so the updater is checking for a bundled local package.", 20);
                try
                {
                    sourceDirectory = ResolveSourceDirectory(options);
                }
                catch (Exception ex) when (string.IsNullOrWhiteSpace(options.SourceDirectory))
                {
                    Log($"No automatic local update package was found: {ex.Message}");
                    ShowMessage(
                        $"No update feed or local update package was found.{Environment.NewLine}{Environment.NewLine}Place {UpdateConfigFileName} next to the updater, pass --manifest-url <url>, or keep dist-updater-payload\\win-unpacked next to the updater package.",
                        MessageBoxIcon.Information,
                        options.Silent,
                        ui);
                    return 0;
                }

                Log($"Resolved source directory: {sourceDirectory}");
                ui?.Report(
                    string.IsNullOrWhiteSpace(options.SourceDirectory) ? "Local update found" : "Using local update package",
                    sourceDirectory,
                    25);
                ValidateDirectories(installDirectory, sourceDirectory);

                var elevationResult = EnsureElevationIfNeeded(installDirectory, options, ui);
                if (elevationResult == ElevationResult.Cancelled)
                {
                    return 0;
                }

                if (elevationResult == ElevationResult.Relaunched)
                {
                    return 0;
                }

                if (!ConfirmUpdate(entry, installDirectory, sourceDirectory, options, ui))
                {
                    return 0;
                }
            }

            using var installMutex = AcquireInstallMutex(installDirectory);
            var wasAppRunning = CloseRunningApp(installDirectory, options, ui);
            UpdateTransactionContext? transaction = null;
            var preserveRollbackDirectory = false;
            UpdateResult result;
            try
            {
                transaction = BeginUpdateTransaction(installDirectory, wasAppRunning);
                SetUpdateTransactionState(transaction, TransactionStateApplying);
                result = ApplyUpdate(sourceDirectory, installDirectory, ui);
                if (remoteUpdate is not null)
                {
                    SaveAppliedReleaseReceipt(installDirectory, remoteUpdate);
                }
                SetUpdateTransactionState(transaction, TransactionStateCommitted);
            }
            catch (Exception updateError)
            {
                var rollbackSucceeded = transaction is null;
                Exception? rollbackError = null;
                if (transaction is not null)
                {
                    try
                    {
                        ValidateTransactionBackup(transaction);
                        RestoreRollbackBackup(transaction.BackupDirectory, installDirectory);
                        SetUpdateTransactionState(transaction, TransactionStateRolledBack);
                        rollbackSucceeded = true;
                    }
                    catch (Exception ex)
                    {
                        rollbackError = ex;
                        preserveRollbackDirectory = true;
                        Log($"Rollback failed: {ex}");
                    }
                }

                if (wasAppRunning && rollbackSucceeded)
                {
                    try
                    {
                        LaunchInstalledApp(installDirectory);
                    }
                    catch (Exception ex)
                    {
                        Log($"Could not relaunch NexPlay after rollback: {ex}");
                    }
                }

                if (rollbackError is not null)
                {
                    throw new InvalidOperationException(
                        $"The update failed and the previous NexPlay installation could not be fully restored.{Environment.NewLine}{Environment.NewLine}Update error: {updateError.Message}{Environment.NewLine}Rollback error: {rollbackError.Message}{Environment.NewLine}Recovery backup: {transaction?.DirectoryPath}",
                        new AggregateException(updateError, rollbackError));
                }

                throw new InvalidOperationException(
                    $"The update failed. The previous NexPlay installation was restored.{Environment.NewLine}{Environment.NewLine}{updateError.Message}",
                    updateError);
            }
            finally
            {
                CleanupRollbackBackup(transaction?.DirectoryPath ?? string.Empty, preserveRollbackDirectory);
            }
            Log($"Update finished successfully. Synced files: {result.SyncedFiles}. Removed files: {result.RemovedFiles}.");

            if (!options.Silent)
            {
                var launchNow = ui is not null
                    ? ui.CompleteAndAskLaunch(
                        "NexPlay is up to date",
                        $"Synced files: {result.SyncedFiles}{Environment.NewLine}Removed stale files: {result.RemovedFiles}",
                        "Launch NexPlay",
                        "Close")
                    : MessageBox.Show(
                        $"Update finished.{Environment.NewLine}{Environment.NewLine}Synced files: {result.SyncedFiles}{Environment.NewLine}Removed stale files: {result.RemovedFiles}{Environment.NewLine}{Environment.NewLine}Launch {ProductName} now?",
                        UpdaterDisplayName,
                        MessageBoxButtons.YesNo,
                        MessageBoxIcon.Information,
                        MessageBoxDefaultButton.Button1) == DialogResult.Yes;

                if (launchNow)
                {
                    TryLaunchAfterCommittedOperation(installDirectory, options.Silent, ui, "update");
                }
            }
            else if (options.RelaunchAfterUpdate)
            {
                TryLaunchAfterCommittedOperation(installDirectory, options.Silent, ui, "update");
            }

            return 0;
        }
        catch (Exception ex)
        {
            Log($"Update failed: {ex}");
            if (options?.Silent != true)
            {
                if (ui is not null)
                {
                    ui.FailAndWait("Update failed", ex.Message);
                }
                else
                {
                    MessageBox.Show(
                        ex.Message,
                        UpdaterDisplayName,
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error);
                }
            }
            return 1;
        }
        finally
        {
            if (remoteUpdate?.TemporaryDirectory is { Length: > 0 } temporaryDirectory)
            {
                TryDeleteDirectory(temporaryDirectory);
            }
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
            if (!IsExactInstalledProductName(displayName))
            {
                continue;
            }

            var uninstallString = appKey.GetValue("UninstallString") as string;
            var displayIcon = appKey.GetValue("DisplayIcon") as string;
            var installLocation = appKey.GetValue("InstallLocation") as string;
            if (string.IsNullOrWhiteSpace(uninstallString) && string.IsNullOrWhiteSpace(displayIcon) && string.IsNullOrWhiteSpace(installLocation))
            {
                continue;
            }

            yield return new InstalledAppEntry(
                displayName!.Trim(),
                (appKey.GetValue("DisplayVersion") as string)?.Trim() ?? string.Empty,
                uninstallString?.Trim() ?? string.Empty,
                installLocation?.Trim() ?? string.Empty,
                displayIcon?.Trim() ?? string.Empty,
                ParseVersion(appKey.GetValue("DisplayVersion") as string));
        }
    }

    private static bool IsExactInstalledProductName(string? displayName)
    {
        return !string.IsNullOrWhiteSpace(displayName)
            && Regex.IsMatch(
                displayName.Trim(),
                @"^NexPlay(?:\s+\d+(?:\.\d+){1,3})?$",
                RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    }

    private static Version ParseVersion(string? rawVersion)
    {
        if (string.IsNullOrWhiteSpace(rawVersion))
        {
            return new Version(0, 0, 0, 0);
        }

        var cleaned = Regex.Replace(rawVersion, @"[^0-9.]", string.Empty);
        if (!Version.TryParse(cleaned, out var version))
        {
            return new Version(0, 0, 0, 0);
        }

        // System.Version treats 2.0.9 and 2.0.9.0 as different values because
        // the omitted revision is -1. Release manifests intentionally use the
        // three-part public version while Windows file metadata uses four
        // parts, so normalize missing components before update comparisons.
        return new Version(
            Math.Max(0, version.Major),
            Math.Max(0, version.Minor),
            Math.Max(0, version.Build),
            Math.Max(0, version.Revision));
    }

    private static string ResolveInstallDirectory(InstalledAppEntry entry)
    {
        var candidates = new List<string>();

        AddCandidate(candidates, entry.InstallLocation);

        if (TryParseCommandFilePath(entry.UninstallCommand, out var uninstallExecutablePath))
        {
            AddCandidate(candidates, Path.GetDirectoryName(uninstallExecutablePath));
        }

        if (TryParseDisplayIconPath(entry.DisplayIcon, out var displayIconPath))
        {
            AddCandidate(candidates, Path.GetDirectoryName(displayIconPath));
        }

        foreach (var candidate in candidates)
        {
            if (!Directory.Exists(candidate))
            {
                continue;
            }

            var appExecutablePath = Path.Combine(candidate, ProductExecutableName);
            if (File.Exists(appExecutablePath))
            {
                Log($"Resolved install directory candidate: {candidate}");
                return candidate;
            }
        }

        throw new InvalidOperationException(
            $"The installed {ProductName} folder could not be resolved from the Windows uninstall registry.");
    }

    private static string ResolveInstallDirectoryOption(string installDirectory, string label)
    {
        foreach (var candidate in ResolveExplicitInstallCandidates(installDirectory))
        {
            Log($"Trying explicit {label} candidate: {candidate}");
            if (IsValidInstallDirectory(candidate))
            {
                return candidate;
            }
        }

        throw new InvalidOperationException(
            $"The provided {label} folder was not a valid NexPlay Windows app folder:{Environment.NewLine}{installDirectory}");
    }

    private static string ResolvePortableInstallDirectory(UpdaterOptions options)
    {
        foreach (var candidate in GetAutomaticInstallCandidates())
        {
            if (IsSourceDirectoryCandidate(candidate, options))
            {
                Log($"Skipped install candidate because it matches the update source: {candidate}");
                continue;
            }

            Log($"Trying automatic install candidate: {candidate}");
            if (IsValidInstallDirectory(candidate))
            {
                return candidate;
            }
        }

        return string.Empty;
    }

    private static InstalledAppEntry CreatePortableInstalledEntry(string installDirectory)
    {
        var executablePath = Path.Combine(installDirectory, ProductExecutableName);
        var displayVersion = "0.0.0";
        try
        {
            var versionInfo = FileVersionInfo.GetVersionInfo(executablePath);
            displayVersion = FirstNonEmpty(versionInfo.ProductVersion, versionInfo.FileVersion) ?? displayVersion;
        }
        catch (Exception ex)
        {
            Log($"Could not read portable NexPlay executable version: {ex.Message}");
        }

        return new InstalledAppEntry(
            ProductName,
            displayVersion,
            string.Empty,
            NormalizeDirectory(installDirectory),
            executablePath,
            ParseVersion(displayVersion));
    }

    private static string ResolveSourceDirectory(UpdaterOptions options)
    {
        if (!string.IsNullOrWhiteSpace(options.SourceDirectory))
        {
            foreach (var candidate in ResolveExplicitSourceCandidates(options.SourceDirectory))
            {
                Log($"Trying explicit source candidate: {candidate}");
                if (IsValidSourceDirectory(candidate))
                {
                    return candidate;
                }
            }

            throw new InvalidOperationException(
                $"The provided update source folder was not valid:{Environment.NewLine}{options.SourceDirectory}");
        }

        var candidates = GetAutomaticSourceCandidates();

        foreach (var candidate in candidates)
        {
            Log($"Trying automatic source candidate: {candidate}");
            if (IsValidSourceDirectory(candidate))
            {
                return candidate;
            }
        }

        throw new InvalidOperationException(
            $"A valid NexPlay build folder was not found.{Environment.NewLine}{Environment.NewLine}Expected a folder like 'win-unpacked' next to the updater or inside 'dist'.");
    }

    private static string? ResolveUpdateManifestLocation(UpdaterOptions options, string installDirectory)
    {
        if (!string.IsNullOrWhiteSpace(options.ManifestUrl))
        {
            Log($"Using update manifest from command line: {options.ManifestUrl}");
            return options.ManifestUrl.Trim();
        }

        var environmentManifestUrl = Environment.GetEnvironmentVariable("NEXPLAY_UPDATE_MANIFEST_URL");
        if (!string.IsNullOrWhiteSpace(environmentManifestUrl))
        {
            Log("Using update manifest from NEXPLAY_UPDATE_MANIFEST_URL.");
            return environmentManifestUrl.Trim();
        }

        foreach (var configPath in GetUpdateConfigCandidates(installDirectory))
        {
            if (!File.Exists(configPath))
            {
                continue;
            }

            var manifestLocation = ReadManifestLocationFromConfig(configPath);
            if (!string.IsNullOrWhiteSpace(manifestLocation))
            {
                Log($"Using update manifest from config: {configPath}");
                return manifestLocation;
            }
        }

        return null;
    }

    private static IEnumerable<string> GetUpdateConfigCandidates(string installDirectory)
    {
        var candidates = new List<string>();
        var processDirectory = Path.GetDirectoryName(Environment.ProcessPath);
        var currentDirectory = Environment.CurrentDirectory;

        AddCandidate(candidates, Path.Combine(processDirectory ?? string.Empty, UpdateConfigFileName));
        AddCandidate(candidates, Path.Combine(currentDirectory, UpdateConfigFileName));
        AddCandidate(candidates, Path.Combine(installDirectory, UpdateConfigFileName));
        AddCandidate(candidates, Path.Combine(installDirectory, "resources", UpdateConfigFileName));

        return candidates;
    }

    private static string? ReadManifestLocationFromConfig(string configPath)
    {
        try
        {
            var raw = File.ReadAllText(configPath, Encoding.UTF8).Trim();
            if (string.IsNullOrWhiteSpace(raw))
            {
                return null;
            }

            string? manifestLocation;
            if (raw.StartsWith("{", StringComparison.Ordinal))
            {
                var config = JsonSerializer.Deserialize<UpdateFeedConfig>(raw, JsonOptions);
                manifestLocation = FirstNonEmpty(config?.ManifestUrl, config?.UpdateManifestUrl, config?.LatestJsonUrl);
            }
            else
            {
                manifestLocation = raw
                    .Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
                    .Select(line => line.Trim())
                    .FirstOrDefault(line => line.Length > 0 && !line.StartsWith("#", StringComparison.Ordinal));
            }

            if (string.IsNullOrWhiteSpace(manifestLocation))
            {
                return null;
            }

            return ResolveLocationRelativeToFile(configPath, manifestLocation.Trim());
        }
        catch (Exception ex)
        {
            Log($"Could not read update config {configPath}: {ex.Message}");
            return null;
        }
    }

    private static RemoteUpdatePlan CheckRemoteUpdate(
        string manifestLocation,
        InstalledAppEntry entry,
        UpdaterOptions options,
        string installDirectory)
    {
        ValidateUpdateLocation(manifestLocation, options.AllowInsecureUpdateUrl, "manifest");
        Log($"Checking remote update manifest: {manifestLocation}");

        var manifestJson = ReadTextFromLocation(manifestLocation, options.AllowInsecureUpdateUrl);
        var manifest = JsonSerializer.Deserialize<UpdateManifest>(manifestJson, JsonOptions)
            ?? throw new InvalidOperationException("The update manifest could not be parsed.");
        var artifact = SelectUpdateArtifact(manifest);

        var versionLabel = FirstNonEmpty(artifact.Version, manifest.Version)
            ?? throw new InvalidOperationException("The update manifest is missing a version.");
        var artifactUrl = artifact.Url
            ?? throw new InvalidOperationException("The update manifest is missing an artifact URL.");
        var resolvedArtifactLocation = ResolveArtifactLocation(manifestLocation, artifactUrl);

        ValidateUpdateLocation(resolvedArtifactLocation, options.AllowInsecureUpdateUrl, "artifact");
        var latestVersion = ParseVersion(versionLabel);
        var sha256 = FirstNonEmpty(artifact.Sha256, manifest.Sha256);
        var expectedSize = artifact.Size ?? manifest.Size;
        var publishedAt = FirstNonEmpty(artifact.PubDate, manifest.PubDate);
        var appliedReceiptReason = string.Empty;
        var appliedReleaseIsCurrent = !options.Force && IsAppliedReleaseReceiptCurrent(
            installDirectory,
            versionLabel,
            sha256,
            expectedSize,
            publishedAt,
            out appliedReceiptReason);
        if (appliedReleaseIsCurrent)
        {
            Log("Applied update receipt matches the remote manifest; treating this release as already installed.");
        }
        else if (!string.IsNullOrWhiteSpace(appliedReceiptReason))
        {
            Log(appliedReceiptReason);
        }

        var updateAvailable = options.Force
            || (!appliedReleaseIsCurrent && latestVersion > entry.Version)
            || (!appliedReleaseIsCurrent && latestVersion == entry.Version && IsSameVersionRemoteUpdateAvailable(
                installDirectory,
                versionLabel,
                sha256,
                expectedSize,
                publishedAt));

        return new RemoteUpdatePlan
        {
            ManifestLocation = manifestLocation,
            ArtifactLocation = resolvedArtifactLocation,
            VersionLabel = versionLabel,
            LatestVersion = latestVersion,
            UpdateAvailable = updateAvailable,
            AppliedReleaseReceiptCurrent = appliedReleaseIsCurrent,
            AppliedReleaseVersionLabel = appliedReleaseIsCurrent ? versionLabel : null,
            Notes = FirstNonEmpty(artifact.Notes, manifest.Notes),
            PublishedAt = publishedAt,
            Sha256 = sha256,
            ExpectedSize = expectedSize
        };
    }

    private static string BuildUpToDateMessage(RemoteUpdatePlan remoteUpdate, InstalledAppEntry entry)
    {
        var installedVersionLabel = GetDisplayedInstalledVersionLabel(entry, remoteUpdate);
        var registryVersionLabel = FormatVersionLabel(entry.DisplayVersion);
        var registryLine = remoteUpdate.AppliedReleaseReceiptCurrent
            && !string.Equals(installedVersionLabel, registryVersionLabel, StringComparison.OrdinalIgnoreCase)
                ? $"{Environment.NewLine}Windows registry version: {registryVersionLabel}"
                : string.Empty;

        return $"{ProductName} is up to date.{Environment.NewLine}{Environment.NewLine}Installed release: {installedVersionLabel}{Environment.NewLine}Latest release: {remoteUpdate.VersionLabel}{registryLine}";
    }

    private static string GetDisplayedInstalledVersionLabel(InstalledAppEntry entry, RemoteUpdatePlan? remoteUpdate = null)
    {
        if (remoteUpdate?.AppliedReleaseReceiptCurrent == true
            && !string.IsNullOrWhiteSpace(remoteUpdate.AppliedReleaseVersionLabel))
        {
            return remoteUpdate.AppliedReleaseVersionLabel;
        }

        return FormatVersionLabel(entry.DisplayVersion);
    }

    private static bool IsAppliedReleaseReceiptCurrent(
        string installDirectory,
        string versionLabel,
        string? artifactSha256,
        long? expectedSize,
        string? publishedAt,
        out string reason)
    {
        reason = string.Empty;
        var hasArtifactIdentity = !string.IsNullOrWhiteSpace(artifactSha256)
            || expectedSize is > 0
            || !string.IsNullOrWhiteSpace(publishedAt);
        if (!hasArtifactIdentity)
        {
            reason = "Remote manifest has no artifact identity, so the applied release receipt cannot prove the release is current.";
            return false;
        }

        var receipt = LoadAppliedReleaseReceipt(installDirectory);
        if (receipt is null)
        {
            reason = "No applied update receipt was found.";
            return false;
        }

        if (!string.Equals(receipt.Version, versionLabel, StringComparison.OrdinalIgnoreCase))
        {
            reason = $"Applied update receipt version differs from manifest. Receipt: {receipt.Version}. Manifest: {versionLabel}.";
            return false;
        }

        var normalizedManifestSha = NormalizeSha256Text(artifactSha256);
        var normalizedReceiptSha = NormalizeSha256Text(receipt.ArtifactSha256);
        if (!string.IsNullOrWhiteSpace(normalizedManifestSha))
        {
            if (string.IsNullOrWhiteSpace(normalizedReceiptSha))
            {
                reason = "Applied update receipt has no artifact SHA-256.";
                return false;
            }

            if (!string.Equals(normalizedManifestSha, normalizedReceiptSha, StringComparison.OrdinalIgnoreCase))
            {
                reason = "Manifest artifact SHA-256 differs from the applied update receipt.";
                return false;
            }
        }

        if (expectedSize is > 0 && receipt.ArtifactSize != expectedSize.Value)
        {
            reason = $"Manifest artifact size differs from the applied update receipt. Receipt: {receipt.ArtifactSize}. Manifest: {expectedSize.Value}.";
            return false;
        }

        if (string.IsNullOrWhiteSpace(normalizedManifestSha)
            && !string.IsNullOrWhiteSpace(publishedAt)
            && !string.Equals(receipt.PublishedAt, publishedAt, StringComparison.OrdinalIgnoreCase))
        {
            reason = "Manifest published date differs from the applied update receipt.";
            return false;
        }

        return true;
    }

    private static UpdateArtifact SelectUpdateArtifact(UpdateManifest manifest)
    {
        if (manifest.Platforms is not null)
        {
            foreach (var key in new[] { "win-x64", "windows-x64", "win32-x64", "win", "windows" })
            {
                if (manifest.Platforms.TryGetValue(key, out var artifact) && artifact is not null)
                {
                    return artifact;
                }
            }
        }

        return new UpdateArtifact
        {
            Url = manifest.Url,
            Sha256 = manifest.Sha256,
            Size = manifest.Size,
            Version = manifest.Version,
            Notes = manifest.Notes,
            PubDate = manifest.PubDate
        };
    }

    private static bool IsSameVersionRemoteUpdateAvailable(
        string installDirectory,
        string versionLabel,
        string? artifactSha256,
        long? expectedSize,
        string? publishedAt)
    {
        var hasArtifactIdentity = !string.IsNullOrWhiteSpace(artifactSha256)
            || expectedSize is > 0
            || !string.IsNullOrWhiteSpace(publishedAt);
        if (!hasArtifactIdentity)
        {
            Log("Same-version manifest has no artifact identity; treating it as already installed.");
            return false;
        }

        var receipt = LoadAppliedReleaseReceipt(installDirectory);
        if (receipt is null)
        {
            Log("No applied update receipt was found; allowing same-version update once.");
            return true;
        }

        if (!string.Equals(receipt.Version, versionLabel, StringComparison.OrdinalIgnoreCase))
        {
            Log($"Applied update receipt version differs from manifest. Receipt: {receipt.Version}. Manifest: {versionLabel}.");
            return true;
        }

        var normalizedManifestSha = NormalizeSha256Text(artifactSha256);
        var normalizedReceiptSha = NormalizeSha256Text(receipt.ArtifactSha256);
        if (!string.IsNullOrWhiteSpace(normalizedManifestSha))
        {
            if (string.IsNullOrWhiteSpace(normalizedReceiptSha))
            {
                Log("Applied update receipt has no artifact SHA-256; allowing same-version update.");
                return true;
            }

            if (!string.Equals(normalizedManifestSha, normalizedReceiptSha, StringComparison.OrdinalIgnoreCase))
            {
                Log("Manifest artifact SHA-256 differs from the applied update receipt; allowing same-version update.");
                return true;
            }
        }

        if (expectedSize is > 0 && receipt.ArtifactSize != expectedSize.Value)
        {
            Log($"Manifest artifact size differs from the applied update receipt. Receipt: {receipt.ArtifactSize}. Manifest: {expectedSize.Value}.");
            return true;
        }

        if (string.IsNullOrWhiteSpace(normalizedManifestSha)
            && !string.IsNullOrWhiteSpace(publishedAt)
            && !string.Equals(receipt.PublishedAt, publishedAt, StringComparison.OrdinalIgnoreCase))
        {
            Log("Manifest published date differs from the applied update receipt; allowing same-version update.");
            return true;
        }

        return false;
    }

    private static AppliedReleaseReceipt? LoadAppliedReleaseReceipt(string installDirectory)
    {
        var receiptPath = Path.Combine(installDirectory, ReleaseReceiptFileName);
        if (!File.Exists(receiptPath))
        {
            return null;
        }

        try
        {
            var raw = File.ReadAllText(receiptPath, Encoding.UTF8);
            return JsonSerializer.Deserialize<AppliedReleaseReceipt>(raw, JsonOptions);
        }
        catch (Exception ex)
        {
            Log($"Could not read applied update receipt: {ex.Message}");
            return null;
        }
    }

    private static void SaveAppliedReleaseReceipt(string installDirectory, RemoteUpdatePlan remoteUpdate)
    {
        var receipt = new AppliedReleaseReceipt
        {
            Version = remoteUpdate.VersionLabel,
            ArtifactSha256 = NormalizeSha256Text(remoteUpdate.Sha256),
            ArtifactSize = remoteUpdate.ExpectedSize,
            PublishedAt = remoteUpdate.PublishedAt,
            ManifestLocation = remoteUpdate.ManifestLocation,
            ArtifactLocation = remoteUpdate.ArtifactLocation,
            InstalledAt = DateTimeOffset.UtcNow.ToString("o")
        };
        var receiptJson = JsonSerializer.Serialize(receipt, new JsonSerializerOptions(JsonOptions)
        {
            WriteIndented = true
        });
        AtomicWriteAllText(Path.Combine(installDirectory, ReleaseReceiptFileName), receiptJson);
        Log("Saved applied update receipt.");
    }

    private static string NormalizeSha256Text(string? sha256)
    {
        return string.IsNullOrWhiteSpace(sha256)
            ? string.Empty
            : Regex.Replace(sha256, @"[^a-fA-F0-9]", string.Empty).ToLowerInvariant();
    }

    private static bool ConfirmRemoteUpdate(
        RemoteUpdatePlan remoteUpdate,
        InstalledAppEntry entry,
        UpdaterOptions options,
        IUpdaterUi? ui = null)
    {
        if (options.Silent)
        {
            return true;
        }

        if (ui is not null)
        {
            return ui.Confirm(
                "Download update?",
                BuildRemoteUpdateAvailableMessage(remoteUpdate, entry),
                "Download and install",
                "Not now",
                30);
        }

        var response = MessageBox.Show(
            $"{BuildRemoteUpdateAvailableMessage(remoteUpdate, entry)}{Environment.NewLine}{Environment.NewLine}Download and install this update now?",
            UpdaterDisplayName,
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Question,
            MessageBoxDefaultButton.Button1);

        return response == DialogResult.Yes;
    }

    private static string BuildRemoteUpdateAvailableMessage(RemoteUpdatePlan remoteUpdate, InstalledAppEntry entry)
    {
        var sizeLine = remoteUpdate.ExpectedSize is > 0
            ? $"{Environment.NewLine}Download size: {FormatSize(remoteUpdate.ExpectedSize.Value)}"
            : string.Empty;
        var dateLine = string.IsNullOrWhiteSpace(remoteUpdate.PublishedAt)
            ? string.Empty
            : $"{Environment.NewLine}Published: {remoteUpdate.PublishedAt}";
        var notesLine = string.IsNullOrWhiteSpace(remoteUpdate.Notes)
            ? string.Empty
            : $"{Environment.NewLine}{Environment.NewLine}Notes:{Environment.NewLine}{TruncateForMessage(remoteUpdate.Notes, 700)}";

        return $"A {ProductName} update is available.{Environment.NewLine}{Environment.NewLine}Installed version: {FormatVersionLabel(entry.DisplayVersion)}{Environment.NewLine}Latest version: {remoteUpdate.VersionLabel}{sizeLine}{dateLine}{notesLine}";
    }

    private static string DownloadAndPrepareRemoteUpdate(
        RemoteUpdatePlan remoteUpdate,
        UpdaterOptions options,
        IUpdaterUi? ui = null)
    {
        if (TryGetLocalDirectoryPath(remoteUpdate.ArtifactLocation, out var localDirectory))
        {
            Log($"Remote update artifact resolved to local directory: {localDirectory}");
            ui?.Report("Using local update folder", localDirectory, 45);
            return localDirectory;
        }

        var tempRoot = CreateSecureWorkingDirectory("download");
        var archivePath = Path.Combine(tempRoot, "update.zip");
        var extractRoot = Path.Combine(tempRoot, "payload");
        remoteUpdate.TemporaryDirectory = tempRoot;

        Directory.CreateDirectory(extractRoot);

        Log($"Downloading update artifact: {remoteUpdate.ArtifactLocation}");
        ui?.Report("Downloading update", remoteUpdate.ArtifactLocation, 38);
        DownloadFileFromLocation(remoteUpdate.ArtifactLocation, archivePath, options.AllowInsecureUpdateUrl);

        var archiveInfo = new FileInfo(archivePath);
        if (remoteUpdate.ExpectedSize is > 0 && archiveInfo.Length != remoteUpdate.ExpectedSize.Value)
        {
            throw new InvalidOperationException(
                $"The downloaded update size did not match the manifest. Expected {remoteUpdate.ExpectedSize.Value} bytes, got {archiveInfo.Length} bytes.");
        }

        if (!string.IsNullOrWhiteSpace(remoteUpdate.Sha256))
        {
            ui?.Report("Verifying update", "Checking SHA-256 integrity.", 48);
            ValidateFileSha256(archivePath, remoteUpdate.Sha256);
        }
        else
        {
            Log("The update manifest did not include a SHA-256 checksum.");
        }

        ui?.Report("Extracting update", "Preparing the downloaded package.", 52);
        try
        {
            ZipFile.ExtractToDirectory(archivePath, extractRoot);
        }
        catch (InvalidDataException ex)
        {
            throw new InvalidOperationException("The downloaded update artifact must be a .zip file containing the win-unpacked payload.", ex);
        }

        var sourceDirectory = ResolveExtractedSourceDirectory(extractRoot);
        Log($"Prepared remote update payload: {sourceDirectory}");
        return sourceDirectory;
    }

    private static string ResolveExtractedSourceDirectory(string extractRoot)
    {
        var candidates = new List<string>();
        AddCandidate(candidates, extractRoot);
        AddCandidate(candidates, Path.Combine(extractRoot, "win-unpacked"));

        foreach (var directory in Directory.EnumerateDirectories(extractRoot, "win-unpacked", SearchOption.AllDirectories).Take(20))
        {
            AddCandidate(candidates, directory);
        }

        foreach (var candidate in candidates)
        {
            Log($"Trying extracted source candidate: {candidate}");
            if (IsValidSourceDirectory(candidate))
            {
                return candidate;
            }
        }

        throw new InvalidOperationException("The downloaded update did not contain a valid NexPlay win-unpacked payload.");
    }

    private static string ReadTextFromLocation(string location, bool allowInsecure)
    {
        if (TryGetLocalFilePath(location, out var localPath))
        {
            if (!File.Exists(localPath))
            {
                throw new FileNotFoundException("The local update manifest was not found.", localPath);
            }

            return File.ReadAllText(localPath, Encoding.UTF8);
        }

        using var client = CreateHttpClient();
        using var response = client.GetAsync(location).GetAwaiter().GetResult();
        response.EnsureSuccessStatusCode();
        return response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
    }

    private static void DownloadFileFromLocation(string location, string destinationPath, bool allowInsecure)
    {
        if (TryGetLocalFilePath(location, out var localPath))
        {
            if (!File.Exists(localPath))
            {
                throw new FileNotFoundException("The local update artifact was not found.", localPath);
            }

            File.Copy(localPath, destinationPath, overwrite: true);
            return;
        }

        using var client = CreateHttpClient();
        using var response = client.GetAsync(location, HttpCompletionOption.ResponseHeadersRead).GetAwaiter().GetResult();
        response.EnsureSuccessStatusCode();
        using var source = response.Content.ReadAsStreamAsync().GetAwaiter().GetResult();
        using var destination = File.Create(destinationPath);
        source.CopyTo(destination);
    }

    private static HttpClient CreateHttpClient()
    {
        var client = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(NetworkTimeoutSeconds)
        };
        client.DefaultRequestHeaders.UserAgent.ParseAdd("NexPlayUpdater/2.0");
        client.DefaultRequestHeaders.CacheControl = new System.Net.Http.Headers.CacheControlHeaderValue
        {
            NoCache = true
        };
        return client;
    }

    private static void ValidateUpdateLocation(string location, bool allowInsecure, string label)
    {
        if (Path.IsPathRooted(location))
        {
            return;
        }

        if (!Uri.TryCreate(location, UriKind.Absolute, out var uri))
        {
            return;
        }

        if (uri.Scheme == Uri.UriSchemeFile)
        {
            return;
        }

        if (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp)
        {
            throw new InvalidOperationException($"The update {label} URL must use HTTPS, HTTP, file, or a local path.");
        }

        if (uri.Scheme == Uri.UriSchemeHttps || allowInsecure || IsLoopbackHost(uri.Host))
        {
            return;
        }

        throw new InvalidOperationException(
            $"The update {label} URL must use HTTPS for publishing. Use --allow-insecure-update-url only for local testing.");
    }

    private static bool IsLoopbackHost(string host)
    {
        if (string.Equals(host, "localhost", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return IPAddress.TryParse(host, out var address) && IPAddress.IsLoopback(address);
    }

    private static string ResolveArtifactLocation(string manifestLocation, string artifactLocation)
    {
        if (string.IsNullOrWhiteSpace(artifactLocation))
        {
            return artifactLocation;
        }

        if (Path.IsPathRooted(artifactLocation) || Uri.TryCreate(artifactLocation, UriKind.Absolute, out _))
        {
            return artifactLocation;
        }

        if (Uri.TryCreate(manifestLocation, UriKind.Absolute, out var manifestUri))
        {
            if (manifestUri.Scheme == Uri.UriSchemeHttp || manifestUri.Scheme == Uri.UriSchemeHttps)
            {
                return new Uri(manifestUri, artifactLocation).ToString();
            }

            if (manifestUri.Scheme == Uri.UriSchemeFile)
            {
                var manifestDirectory = Path.GetDirectoryName(manifestUri.LocalPath) ?? string.Empty;
                return Path.Combine(manifestDirectory, artifactLocation);
            }
        }

        var baseDirectory = Path.GetDirectoryName(NormalizePath(manifestLocation)) ?? Environment.CurrentDirectory;
        return Path.Combine(baseDirectory, artifactLocation);
    }

    private static string ResolveLocationRelativeToFile(string configPath, string location)
    {
        if (Path.IsPathRooted(location) || Uri.TryCreate(location, UriKind.Absolute, out _))
        {
            return location;
        }

        return Path.Combine(Path.GetDirectoryName(configPath) ?? Environment.CurrentDirectory, location);
    }

    private static bool TryGetLocalFilePath(string location, out string localPath)
    {
        localPath = string.Empty;
        if (Path.IsPathRooted(location))
        {
            localPath = NormalizePath(location);
            return true;
        }

        if (!Uri.TryCreate(location, UriKind.Absolute, out _))
        {
            localPath = NormalizePath(location);
            return true;
        }

        if (Uri.TryCreate(location, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeFile)
        {
            localPath = NormalizePath(uri.LocalPath);
            return true;
        }

        return false;
    }

    private static bool TryGetLocalDirectoryPath(string location, out string localPath)
    {
        localPath = string.Empty;
        if (Path.IsPathRooted(location))
        {
            localPath = NormalizeDirectory(location);
            return Directory.Exists(localPath);
        }

        if (!Uri.TryCreate(location, UriKind.Absolute, out _))
        {
            localPath = NormalizeDirectory(location);
            return Directory.Exists(localPath);
        }

        if (Uri.TryCreate(location, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeFile)
        {
            localPath = NormalizeDirectory(uri.LocalPath);
            return Directory.Exists(localPath);
        }

        return false;
    }

    private static void ValidateFileSha256(string filePath, string expectedSha256)
    {
        var expected = Regex.Replace(expectedSha256, @"[^a-fA-F0-9]", string.Empty).ToLowerInvariant();
        if (expected.Length != 64)
        {
            throw new InvalidOperationException("The update manifest SHA-256 checksum is not valid.");
        }

        using var stream = File.OpenRead(filePath);
        var actual = Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
        if (!string.Equals(actual, expected, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("The downloaded update failed SHA-256 verification.");
        }

        Log("Validated update artifact SHA-256.");
    }

    private static string? FirstNonEmpty(params string?[] values)
    {
        return values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))?.Trim();
    }

    private static string FormatVersionLabel(string? version)
    {
        return string.IsNullOrWhiteSpace(version) ? "unknown" : version.Trim();
    }

    private static string FormatSize(long bytes)
    {
        if (bytes < 1024)
        {
            return $"{bytes} B";
        }

        var kb = bytes / 1024d;
        if (kb < 1024)
        {
            return $"{kb:0.0} KB";
        }

        var mb = kb / 1024d;
        if (mb < 1024)
        {
            return $"{mb:0.0} MB";
        }

        return $"{mb / 1024d:0.0} GB";
    }

    private static string TruncateForMessage(string value, int maxLength)
    {
        var clean = value.Trim();
        if (clean.Length <= maxLength)
        {
            return clean;
        }

        return clean[..Math.Max(0, maxLength - 3)] + "...";
    }

    private static List<string> GetAutomaticSourceCandidates()
    {
        var candidates = new List<string>();
        var processDirectory = Path.GetDirectoryName(Environment.ProcessPath);
        var processParentDirectory = Directory.GetParent(processDirectory ?? string.Empty)?.FullName;
        var currentDirectory = Environment.CurrentDirectory;
        var currentParentDirectory = Directory.GetParent(currentDirectory)?.FullName;

        AddCandidate(candidates, Path.Combine(processParentDirectory ?? string.Empty, "dist-updater-payload", "win-unpacked"));
        AddCandidate(candidates, Path.Combine(processDirectory ?? string.Empty, "dist-updater-payload", "win-unpacked"));
        AddCandidate(candidates, Path.Combine(currentDirectory, "dist-updater-payload", "win-unpacked"));
        AddCandidate(candidates, Path.Combine(currentParentDirectory ?? string.Empty, "dist-updater-payload", "win-unpacked"));
        AddCandidate(candidates, Path.Combine(processDirectory ?? string.Empty, "win-unpacked"));
        AddCandidate(candidates, Path.Combine(processDirectory ?? string.Empty, "dist", "win-unpacked"));
        AddCandidate(candidates, Path.Combine(processParentDirectory ?? string.Empty, "dist", "win-unpacked"));
        AddCandidate(candidates, Path.Combine(currentDirectory, "dist", "win-unpacked"));
        AddCandidate(candidates, Path.Combine(currentParentDirectory ?? string.Empty, "dist", "win-unpacked"));
        AddCandidate(candidates, Path.Combine(processParentDirectory ?? string.Empty, "dist-installer", "win-unpacked"));
        AddCandidate(candidates, Path.Combine(currentDirectory, "dist-installer", "win-unpacked"));

        return candidates;
    }

    private static List<string> GetAutomaticInstallCandidates()
    {
        var candidates = new List<string>();
        var processDirectory = Path.GetDirectoryName(Environment.ProcessPath);
        var processParentDirectory = Directory.GetParent(processDirectory ?? string.Empty)?.FullName;
        var currentDirectory = Environment.CurrentDirectory;
        var currentParentDirectory = Directory.GetParent(currentDirectory)?.FullName;

        AddCandidate(candidates, Path.Combine(processDirectory ?? string.Empty, "win-unpacked"));
        AddCandidate(candidates, Path.Combine(processParentDirectory ?? string.Empty, "win-unpacked"));
        AddCandidate(candidates, Path.Combine(currentDirectory, "win-unpacked"));
        AddCandidate(candidates, Path.Combine(currentParentDirectory ?? string.Empty, "win-unpacked"));
        AddCandidate(candidates, Path.Combine(currentDirectory, "dist-updater-build-latest", "win-unpacked"));
        AddCandidate(candidates, Path.Combine(currentDirectory, "dist-installer-latest", "win-unpacked"));
        AddCandidate(candidates, Path.Combine(processParentDirectory ?? string.Empty, "dist-updater-build-latest", "win-unpacked"));
        AddCandidate(candidates, Path.Combine(processParentDirectory ?? string.Empty, "dist-installer-latest", "win-unpacked"));

        return candidates;
    }

    private static IEnumerable<string> ResolveExplicitInstallCandidates(string installDirectory)
    {
        var candidates = new List<string>();
        if (Path.IsPathRooted(installDirectory))
        {
            AddCandidate(candidates, installDirectory);
            return candidates;
        }

        AddCandidate(candidates, Path.Combine(Environment.CurrentDirectory, installDirectory));
        AddCandidate(candidates, Path.Combine(Path.GetDirectoryName(Environment.ProcessPath) ?? string.Empty, installDirectory));
        AddCandidate(candidates, Path.Combine(AppContext.BaseDirectory, installDirectory));
        AddCandidate(candidates, Path.Combine(Directory.GetParent(Path.GetDirectoryName(Environment.ProcessPath) ?? string.Empty)?.FullName ?? string.Empty, installDirectory));
        return candidates;
    }

    private static IEnumerable<string> ResolveExplicitSourceCandidates(string sourceDirectory)
    {
        var candidates = new List<string>();
        if (Path.IsPathRooted(sourceDirectory))
        {
            AddCandidate(candidates, sourceDirectory);
            return candidates;
        }

        AddCandidate(candidates, Path.Combine(Environment.CurrentDirectory, sourceDirectory));
        AddCandidate(candidates, Path.Combine(Path.GetDirectoryName(Environment.ProcessPath) ?? string.Empty, sourceDirectory));
        AddCandidate(candidates, Path.Combine(AppContext.BaseDirectory, sourceDirectory));
        AddCandidate(candidates, Path.Combine(Directory.GetParent(Path.GetDirectoryName(Environment.ProcessPath) ?? string.Empty)?.FullName ?? string.Empty, sourceDirectory));
        return candidates;
    }

    private static bool IsValidInstallDirectory(string candidate)
    {
        if (!TryValidateSourceDirectory(candidate, out var reason))
        {
            Log($"Rejected install candidate: {candidate}. Reason: {reason}");
            return false;
        }

        Log($"Accepted install candidate: {candidate}");
        return true;
    }

    private static bool IsSourceDirectoryCandidate(string candidate, UpdaterOptions options)
    {
        if (string.IsNullOrWhiteSpace(options.SourceDirectory))
        {
            return false;
        }

        var normalizedCandidate = NormalizeDirectory(candidate);
        foreach (var sourceCandidate in ResolveExplicitSourceCandidates(options.SourceDirectory))
        {
            if (PathComparer.Equals(normalizedCandidate, NormalizeDirectory(sourceCandidate)))
            {
                return true;
            }
        }

        return false;
    }

    private static bool IsValidSourceDirectory(string candidate)
    {
        if (!TryValidateSourceDirectory(candidate, out var reason))
        {
            Log($"Rejected source candidate: {candidate}. Reason: {reason}");
            return false;
        }

        Log($"Accepted source candidate: {candidate}");
        return true;
    }

    private static void ValidateDirectories(string installDirectory, string sourceDirectory)
    {
        if (PathComparer.Equals(installDirectory, sourceDirectory))
        {
            throw new InvalidOperationException("The update source folder is the same as the installed NexPlay folder.");
        }

        if (IsPathNestedInside(sourceDirectory, installDirectory) || IsPathNestedInside(installDirectory, sourceDirectory))
        {
            throw new InvalidOperationException("The update source folder cannot be nested inside the installed NexPlay folder, or vice versa.");
        }
    }

    private static ElevationResult EnsureElevationIfNeeded(
        string installDirectory,
        UpdaterOptions options,
        IUpdaterUi? ui = null)
    {
        if (CanWriteToDirectory(installDirectory))
        {
            return ElevationResult.NotNeeded;
        }

        if (IsAdministrator())
        {
            throw new UnauthorizedAccessException("The installed NexPlay folder is not writable even when running as administrator.");
        }

        if (!options.Silent)
        {
            var elevate = ui is not null
                ? ui.Confirm(
                    "Administrator permission needed",
                    "Updating this NexPlay installation needs administrator permission. Relaunch the updater as administrator now?",
                    "Relaunch as admin",
                    "Cancel",
                    32)
                : MessageBox.Show(
                    "Updating this NexPlay installation needs administrator permission. Relaunch the updater as administrator now?",
                    UpdaterDisplayName,
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question,
                    MessageBoxDefaultButton.Button1) == DialogResult.Yes;

            if (!elevate)
            {
                return ElevationResult.Cancelled;
            }
        }

        RelaunchElevated();
        return ElevationResult.Relaunched;
    }

    private static bool CanWriteToDirectory(string installDirectory)
    {
        var probePath = Path.Combine(installDirectory, $".nexplay-updater-probe-{Guid.NewGuid():N}.tmp");
        try
        {
            using var stream = new FileStream(probePath, FileMode.CreateNew, FileAccess.Write, FileShare.None);
            stream.WriteByte(0);
            stream.Close();
            File.Delete(probePath);
            return true;
        }
        catch (UnauthorizedAccessException)
        {
            return false;
        }
        catch (IOException)
        {
            return false;
        }
    }

    private static bool ConfirmUpdate(
        InstalledAppEntry entry,
        string installDirectory,
        string sourceDirectory,
        UpdaterOptions options,
        IUpdaterUi? ui = null)
    {
        if (options.Silent)
        {
            return true;
        }

        var versionLine = string.IsNullOrWhiteSpace(entry.DisplayVersion)
            ? string.Empty
            : $"Installed version: {entry.DisplayVersion}{Environment.NewLine}";

        var payloadSummary = BuildSourcePayloadSummary(sourceDirectory);
        var payloadLine = string.IsNullOrWhiteSpace(payloadSummary)
            ? string.Empty
            : $"{payloadSummary}{Environment.NewLine}{Environment.NewLine}";
        var sourceLine = $"Update source:{Environment.NewLine}{sourceDirectory}";
        var destinationLine = $"Installed folder:{Environment.NewLine}{installDirectory}";
        var message = $"This will replace the installed {ProductName} files with the latest local build.{Environment.NewLine}{Environment.NewLine}{versionLine}{payloadLine}{sourceLine}{Environment.NewLine}{Environment.NewLine}{destinationLine}";

        if (ui is not null)
        {
            return ui.Confirm(
                "Install local update?",
                message,
                "Install update",
                "Cancel",
                35);
        }

        var response = MessageBox.Show(
            message,
            UpdaterDisplayName,
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Question,
            MessageBoxDefaultButton.Button1);

        return response == DialogResult.Yes;
    }

    private static string BuildSourcePayloadSummary(string sourceDirectory)
    {
        var appAsarPath = Path.Combine(sourceDirectory, "resources", "app.asar");
        if (!File.Exists(appAsarPath))
        {
            return string.Empty;
        }

        var info = new FileInfo(appAsarPath);
        var sizeMb = Math.Max(0, info.Length) / 1024d / 1024d;
        return $"Update payload: app.asar from {info.LastWriteTime:yyyy-MM-dd HH:mm} ({sizeMb:0.0} MB)";
    }

    private static bool CloseRunningApp(
        string installDirectory,
        UpdaterOptions options,
        IUpdaterUi? ui = null)
    {
        ui?.Report("Checking running app", "Looking for open NexPlay windows.", 60);
        var runningProcesses = GetInstalledAppProcesses(installDirectory);

        if (runningProcesses.Length == 0)
        {
            return false;
        }

        if (!options.Silent)
        {
            var response = ui is not null
                ? ui.Confirm(
                    "Close NexPlay?",
                    $"{ProductName} is currently open and must be closed before updating.",
                    "Close and continue",
                    "Cancel",
                    62)
                : MessageBox.Show(
                    $"{ProductName} is currently open and must be closed before updating.{Environment.NewLine}{Environment.NewLine}Continue?",
                    UpdaterDisplayName,
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question,
                    MessageBoxDefaultButton.Button1) == DialogResult.Yes;

            if (!response)
            {
                DisposeProcesses(runningProcesses);
                throw new OperationCanceledException("Update cancelled because NexPlay is still running.");
            }
        }

        ui?.Report("Closing NexPlay", "Stopping the running app before installing files.", 64);
        StopInstalledAppProcesses(installDirectory, runningProcesses);
        EnsureInstalledAppStopped(installDirectory);
        return true;
    }

    private static void EnsureInstalledAppStopped(string installDirectory)
    {
        var runningProcesses = GetInstalledAppProcesses(installDirectory);
        if (runningProcesses.Length > 0)
        {
            StopInstalledAppProcesses(installDirectory, runningProcesses);
        }

        var remainingProcesses = GetInstalledAppProcesses(installDirectory);
        try
        {
            if (remainingProcesses.Length > 0)
            {
                throw new InvalidOperationException("NexPlay restarted while the update was being prepared. Close it and try the update again.");
            }
        }
        finally
        {
            foreach (var process in remainingProcesses)
            {
                process.Dispose();
            }
        }
    }

    private static Process[] GetInstalledAppProcesses(string installDirectory)
    {
        var matches = new List<Process>();
        foreach (var process in Process.GetProcessesByName(ProductProcessName))
        {
            if (IsInstalledAppProcess(process, installDirectory))
            {
                matches.Add(process);
            }
            else
            {
                process.Dispose();
            }
        }
        return matches.ToArray();
    }

    private static void StopInstalledAppProcesses(string installDirectory, Process[] runningProcesses)
    {
        try
        {
            var gracefulCandidates = SelectGracefulCloseCandidates(runningProcesses);
            foreach (var process in gracefulCandidates)
            {
                TryRequestGracefulClose(process);
            }
        }
        finally
        {
            DisposeProcesses(runningProcesses);
        }

        if (WaitForInstalledAppExit(installDirectory, 5000))
        {
            return;
        }

        var remainingProcesses = GetInstalledAppProcesses(installDirectory);
        foreach (var process in remainingProcesses)
        {
            ForceStopProcess(process);
        }

        if (!WaitForInstalledAppExit(installDirectory, 10000))
        {
            throw new TimeoutException("Timed out while closing NexPlay.");
        }
    }

    private static Process[] SelectGracefulCloseCandidates(Process[] runningProcesses)
    {
        var windowOwners = runningProcesses.Where(IsWindowOwningProcess).ToArray();
        return windowOwners.Length > 0
            ? windowOwners.OrderBy(GetProcessStartTimeOrMax).ToArray()
            : runningProcesses.OrderBy(GetProcessStartTimeOrMax).Take(1).ToArray();
    }

    private static bool IsWindowOwningProcess(Process process)
    {
        try
        {
            return !process.HasExited && process.MainWindowHandle != IntPtr.Zero;
        }
        catch
        {
            return false;
        }
    }

    private static DateTime GetProcessStartTimeOrMax(Process process)
    {
        try
        {
            return process.StartTime;
        }
        catch
        {
            return DateTime.MaxValue;
        }
    }

    private static void TryRequestGracefulClose(Process process)
    {
        try
        {
            if (!process.HasExited)
            {
                _ = process.CloseMainWindow();
            }
        }
        catch (InvalidOperationException)
        {
            // The process exited while it was being inspected.
        }
        catch (Exception ex)
        {
            Log($"Could not request a graceful NexPlay shutdown; remaining processes will be stopped after the grace period: {ex.Message}");
        }
    }

    private static bool WaitForInstalledAppExit(string installDirectory, int timeoutMilliseconds)
    {
        var stopwatch = Stopwatch.StartNew();
        while (stopwatch.ElapsedMilliseconds < timeoutMilliseconds)
        {
            var processes = GetInstalledAppProcesses(installDirectory);
            if (processes.Length == 0)
            {
                return true;
            }
            DisposeProcesses(processes);
            Thread.Sleep(100);
        }

        var remaining = GetInstalledAppProcesses(installDirectory);
        var exited = remaining.Length == 0;
        DisposeProcesses(remaining);
        return exited;
    }

    private static void DisposeProcesses(IEnumerable<Process> processes)
    {
        foreach (var process in processes)
        {
            process.Dispose();
        }
    }

    private static bool IsInstalledAppProcess(Process process, string installDirectory)
    {
        try
        {
            var mainModulePath = process.MainModule?.FileName;
            if (string.IsNullOrWhiteSpace(mainModulePath))
            {
                return false;
            }

            var normalizedProcessPath = NormalizePath(mainModulePath);
            var normalizedInstallExecutable = NormalizePath(Path.Combine(installDirectory, ProductExecutableName));
            return PathComparer.Equals(normalizedProcessPath, normalizedInstallExecutable);
        }
        catch
        {
            return false;
        }
    }

    private static void ForceStopProcess(Process process)
    {
        try
        {
            if (process.HasExited)
            {
                return;
            }

            process.Kill(entireProcessTree: true);
            if (!process.WaitForExit(10000))
            {
                throw new TimeoutException("Timed out while closing NexPlay.");
            }
        }
        catch (InvalidOperationException)
        {
            // The process exited before the forced-stop request completed.
        }
        finally
        {
            process.Dispose();
        }
    }

    private static UpdateResult ApplyUpdate(
        string sourceDirectory,
        string installDirectory,
        IUpdaterUi? ui = null)
    {
        ui?.Report("Preparing install", "Reading the update file manifest.", 66);
        var manifestPath = Path.Combine(installDirectory, ManifestFileName);
        EnsureTreeContainsNoReparsePoints(sourceDirectory, "update source");
        EnsureTreeContainsNoReparsePoints(installDirectory, "installed app");
        var previousFiles = LoadManifest(manifestPath, installDirectory);
        var currentFiles = EnumerateSafeRelativeFiles(sourceDirectory);
        ValidateSourceFileSet(previousFiles.Count, currentFiles.Count);

        EnsureInstalledAppStopped(installDirectory);
        RunRobocopy(sourceDirectory, installDirectory, ui);
        ValidateCopiedPayload(sourceDirectory, installDirectory, ui);

        ui?.Report("Cleaning old files", "Removing files that are no longer part of NexPlay.", 92);
        var removedCount = RemoveStaleFiles(installDirectory, previousFiles, currentFiles);
        SaveManifest(manifestPath, currentFiles);
        ui?.Report("Update complete", "NexPlay files are installed and validated.", 100);
        return new UpdateResult(currentFiles.Count, removedCount);
    }

    private static InstallMutexLease AcquireInstallMutex(string installDirectory)
    {
        var identity = GetInstallIdentity(installDirectory);
        var mutex = new Mutex(false, $@"Local\NexPlayUpdater-{identity}");
        var acquired = false;
        try
        {
            try
            {
                acquired = mutex.WaitOne(0);
            }
            catch (AbandonedMutexException)
            {
                acquired = true;
            }

            if (!acquired)
            {
                throw new InvalidOperationException("Another NexPlay updater is already working on this installation.");
            }

            return new InstallMutexLease(mutex);
        }
        catch
        {
            if (!acquired)
            {
                mutex.Dispose();
            }
            throw;
        }
    }

    private static string GetInstallIdentity(string installDirectory)
    {
        var normalizedInstallDirectory = NormalizeDirectory(installDirectory).ToUpperInvariant();
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(normalizedInstallDirectory)));
    }

    private static UpdateTransactionContext BeginUpdateTransaction(string installDirectory, bool wasAppRunning)
    {
        var identity = GetInstallIdentity(installDirectory);
        var transactionDirectory = EnsureSecureDirectoryPath(
            GetSecureTransactionRoot(),
            $"transaction-{identity}-{Guid.NewGuid():N}");
        var backupDirectory = EnsureSecureDirectoryPath(transactionDirectory, TransactionBackupDirectoryName);
        var context = new UpdateTransactionContext(
            transactionDirectory,
            backupDirectory,
            Path.Combine(transactionDirectory, TransactionJournalFileName),
            new UpdateTransactionJournal
            {
                TransactionId = Path.GetFileName(transactionDirectory),
                InstallIdentity = identity,
                InstallDirectory = NormalizeDirectory(installDirectory),
                State = TransactionStatePreparing,
                WasAppRunning = wasAppRunning,
                CreatedAt = DateTimeOffset.UtcNow.ToString("o"),
                UpdatedAt = DateTimeOffset.UtcNow.ToString("o")
            });
        try
        {
            WriteUpdateTransactionJournal(context);
            EnsureTreeContainsNoReparsePoints(installDirectory, "installed app");
            RunRobocopyCore(installDirectory, backupDirectory, mirror: true);
            ValidateDirectoryMirror(installDirectory, backupDirectory, "rollback backup");
            var integrity = ComputeDirectoryIntegrity(backupDirectory);
            context.Journal.BackupFileCount = integrity.FileCount;
            context.Journal.BackupSha256 = integrity.Sha256;
            SetUpdateTransactionState(context, TransactionStateBackupReady);
            Log($"Created durable rollback transaction: {transactionDirectory}");
            return context;
        }
        catch
        {
            TryDeleteDirectory(transactionDirectory);
            throw;
        }
    }

    private static void SetUpdateTransactionState(UpdateTransactionContext context, string state)
    {
        context.Journal.State = state;
        context.Journal.UpdatedAt = DateTimeOffset.UtcNow.ToString("o");
        WriteUpdateTransactionJournal(context);
        Log($"Update transaction {context.Journal.TransactionId} entered state {state}.");
    }

    private static void WriteUpdateTransactionJournal(UpdateTransactionContext context)
    {
        var json = JsonSerializer.Serialize(context.Journal, new JsonSerializerOptions(JsonOptions)
        {
            WriteIndented = true
        });
        AtomicWriteAllText(context.JournalPath, json);
    }

    private static DirectoryIntegrity ComputeDirectoryIntegrity(string directory)
    {
        var files = EnumerateSafeRelativeFiles(directory).OrderBy(path => path, PathComparer).ToArray();
        using var digest = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        foreach (var relativePath in files)
        {
            var normalizedRelativePath = relativePath.Replace(Path.DirectorySeparatorChar, '/');
            digest.AppendData(Encoding.UTF8.GetBytes(normalizedRelativePath));
            digest.AppendData(new byte[] { 0 });
            var filePath = ResolveContainedPath(directory, relativePath, "transaction backup");
            using var stream = File.OpenRead(filePath);
            digest.AppendData(SHA256.HashData(stream));
        }

        return new DirectoryIntegrity(files.Length, Convert.ToHexString(digest.GetHashAndReset()).ToLowerInvariant());
    }

    private static void ValidateTransactionBackup(UpdateTransactionContext context)
    {
        EnsureTreeContainsNoReparsePoints(context.BackupDirectory, "transaction backup");
        var integrity = ComputeDirectoryIntegrity(context.BackupDirectory);
        if (integrity.FileCount != context.Journal.BackupFileCount
            || !string.Equals(integrity.Sha256, context.Journal.BackupSha256, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException($"The rollback backup failed its durable integrity check: {context.DirectoryPath}");
        }
    }

    private static bool HasOrphanedUpdateTransaction(string installDirectory)
    {
        return FindUpdateTransactions(installDirectory).Count > 0;
    }

    private static List<UpdateTransactionContext> FindUpdateTransactions(string installDirectory)
    {
        var root = GetSecureTransactionRoot();
        EnsurePathComponentsContainNoReparsePoints(root, "secure updater transaction root");
        var identity = GetInstallIdentity(installDirectory);
        var prefix = $"transaction-{identity}-";
        var contexts = new List<UpdateTransactionContext>();
        foreach (var directory in Directory.EnumerateDirectories(root, $"{prefix}*", SearchOption.TopDirectoryOnly))
        {
            if ((File.GetAttributes(directory) & FileAttributes.ReparsePoint) != 0)
            {
                throw new InvalidOperationException($"An updater transaction directory is an unsafe reparse point: {directory}");
            }

            EnsureTreeContainsNoReparsePoints(directory, "updater transaction");
            var journalPath = ResolveContainedPath(directory, TransactionJournalFileName, "updater transaction journal");
            if (!File.Exists(journalPath))
            {
                throw new InvalidOperationException($"An updater transaction is missing its recovery journal and was preserved: {directory}");
            }

            var journalInfo = new FileInfo(journalPath);
            if (journalInfo.Length <= 0 || journalInfo.Length > 1024 * 1024)
            {
                throw new InvalidOperationException($"An updater transaction has an invalid recovery journal and was preserved: {directory}");
            }

            UpdateTransactionJournal journal;
            try
            {
                journal = JsonSerializer.Deserialize<UpdateTransactionJournal>(File.ReadAllText(journalPath, Encoding.UTF8), JsonOptions)
                    ?? throw new InvalidOperationException("The transaction journal was empty.");
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"An updater transaction journal could not be read and was preserved: {directory}", ex);
            }

            if (!string.Equals(journal.InstallIdentity, identity, StringComparison.OrdinalIgnoreCase)
                || !PathComparer.Equals(NormalizeDirectory(journal.InstallDirectory ?? string.Empty), NormalizeDirectory(installDirectory)))
            {
                throw new InvalidOperationException($"An updater transaction journal did not match this NexPlay installation and was preserved: {directory}");
            }

            var backupDirectory = ResolveContainedPath(directory, TransactionBackupDirectoryName, "transaction backup");
            contexts.Add(new UpdateTransactionContext(directory, backupDirectory, journalPath, journal));
        }

        return contexts.OrderBy(context => context.Journal.CreatedAt, StringComparer.Ordinal).ToList();
    }

    private static bool RecoverOrphanedUpdateTransactions(
        string installDirectory,
        UpdaterOptions options,
        IUpdaterUi? ui = null)
    {
        var restoredInstallation = false;
        foreach (var transaction in FindUpdateTransactions(installDirectory))
        {
            var state = transaction.Journal.State?.Trim().ToLowerInvariant();
            if (state is TransactionStatePreparing or TransactionStateBackupReady
                or TransactionStateCommitted or TransactionStateRolledBack)
            {
                CleanupRollbackBackup(transaction.DirectoryPath, preserveForRecovery: false);
                if (Directory.Exists(transaction.DirectoryPath))
                {
                    throw new InvalidOperationException($"An updater transaction could not be cleaned safely and was preserved: {transaction.DirectoryPath}");
                }
                continue;
            }

            if (state != TransactionStateApplying)
            {
                throw new InvalidOperationException($"An updater transaction has an unknown recovery state and was preserved: {transaction.DirectoryPath}");
            }

            try
            {
                ValidateTransactionBackup(transaction);
                CloseRunningApp(installDirectory, options, ui);
                RestoreRollbackBackup(transaction.BackupDirectory, installDirectory);
                SetUpdateTransactionState(transaction, TransactionStateRolledBack);
                CleanupRollbackBackup(transaction.DirectoryPath, preserveForRecovery: false);
                restoredInstallation = true;

                if (transaction.Journal.WasAppRunning)
                {
                    TryLaunchAfterCommittedOperation(installDirectory, options.Silent, ui, "recovery");
                }
            }
            catch (Exception ex)
            {
                Log($"Interrupted-update recovery failed and was preserved at {transaction.DirectoryPath}: {ex}");
                throw new InvalidOperationException(
                    $"NexPlay could not be restored after an interrupted update. The recovery backup was preserved at:{Environment.NewLine}{transaction.DirectoryPath}{Environment.NewLine}{Environment.NewLine}{ex.Message}",
                    ex);
            }
        }

        return restoredInstallation;
    }

    private static string CreateRollbackBackup(string installDirectory)
    {
        EnsureTreeContainsNoReparsePoints(installDirectory, "installed app");
        var rollbackDirectory = CreateSecureWorkingDirectory("rollback");
        try
        {
            RunRobocopyCore(installDirectory, rollbackDirectory, mirror: true);
            ValidateDirectoryMirror(installDirectory, rollbackDirectory, "rollback backup");
            Log($"Created validated rollback backup: {rollbackDirectory}");
            return rollbackDirectory;
        }
        catch
        {
            TryDeleteDirectory(rollbackDirectory);
            throw;
        }
    }

    private static void RestoreRollbackBackup(string rollbackDirectory, string installDirectory)
    {
        EnsureTreeContainsNoReparsePoints(rollbackDirectory, "rollback backup");
        RunRobocopyCore(rollbackDirectory, installDirectory, mirror: true);
        ValidateDirectoryMirror(rollbackDirectory, installDirectory, "restored installation");
        Log("Restored and validated the previous NexPlay installation.");
    }

    private static void CleanupRollbackBackup(string rollbackDirectory, bool preserveForRecovery)
    {
        if (string.IsNullOrWhiteSpace(rollbackDirectory))
        {
            return;
        }

        if (preserveForRecovery)
        {
            Log($"Preserved rollback backup for manual recovery: {rollbackDirectory}");
            return;
        }

        TryDeleteDirectory(rollbackDirectory);
    }

    private static void ValidateDirectoryMirror(string expectedDirectory, string actualDirectory, string label)
    {
        var expectedFiles = EnumerateSafeRelativeFiles(expectedDirectory);
        var actualFiles = EnumerateSafeRelativeFiles(actualDirectory);
        if (!expectedFiles.SetEquals(actualFiles))
        {
            throw new InvalidOperationException($"The {label} file set did not match the original installation.");
        }

        foreach (var relativePath in expectedFiles)
        {
            var expectedPath = ResolveContainedPath(expectedDirectory, relativePath, label);
            var actualPath = ResolveContainedPath(actualDirectory, relativePath, label);
            if (!FilesMatch(expectedPath, actualPath))
            {
                throw new InvalidOperationException($"The {label} file did not match: {relativePath}");
            }
        }
    }

    private static void RunRobocopy(
        string sourceDirectory,
        string installDirectory,
        IUpdaterUi? ui = null)
    {
        ui?.Report("Installing update", "Copying NexPlay files into the installed app folder.", 72);
        RunRobocopyCore(sourceDirectory, installDirectory, mirror: false);
    }

    private static void RunRobocopyCore(string sourceDirectory, string destinationDirectory, bool mirror)
    {
        Directory.CreateDirectory(destinationDirectory);
        var arguments = string.Join(" ", new[]
        {
            QuoteArgument(sourceDirectory),
            QuoteArgument(destinationDirectory),
            mirror ? "/MIR" : "/E",
            "/R:2",
            "/W:1",
            "/COPY:DAT",
            "/DCOPY:DAT",
            "/XJ",
            "/NFL",
            "/NDL",
            "/NP",
            "/NJH",
            "/NJS"
        });

        using var process = Process.Start(new ProcessStartInfo
        {
            FileName = "robocopy.exe",
            Arguments = arguments,
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = destinationDirectory
        });

        if (process is null)
        {
            throw new InvalidOperationException("robocopy could not be started.");
        }

        process.WaitForExit();
        Log($"robocopy exit code: {process.ExitCode}");
        if (process.ExitCode >= 8)
        {
            throw new InvalidOperationException($"robocopy failed with exit code {process.ExitCode}.");
        }
    }

    private static void ValidateCopiedPayload(
        string sourceDirectory,
        string installDirectory,
        IUpdaterUi? ui = null)
    {
        ui?.Report("Validating install", "Checking required NexPlay files.", 84);
        foreach (var relativePath in RequiredSourceFiles)
        {
            var sourcePath = Path.Combine(sourceDirectory, relativePath);
            var destinationPath = Path.Combine(installDirectory, relativePath);
            if (!File.Exists(sourcePath))
            {
                throw new FileNotFoundException("A required update file is missing from the build output.", sourcePath);
            }

            if (!File.Exists(destinationPath))
            {
                throw new FileNotFoundException("A required updated file is missing from the installed app.", destinationPath);
            }

            if (!FilesMatch(sourcePath, destinationPath))
            {
                throw new InvalidOperationException(
                    $"The updated file did not match the build output after copying:{Environment.NewLine}{relativePath}");
            }

            Log($"Validated file: {relativePath}");
        }
    }

    private static bool TryValidateSourceDirectory(string candidate, out string reason)
    {
        reason = string.Empty;
        if (!Directory.Exists(candidate))
        {
            reason = "Directory does not exist.";
            return false;
        }

        HashSet<string> safeFiles;
        try
        {
            EnsureTreeContainsNoReparsePoints(candidate, "NexPlay folder");
            safeFiles = EnumerateSafeRelativeFiles(candidate);
        }
        catch (Exception ex)
        {
            reason = ex.Message;
            return false;
        }

        foreach (var relativePath in RequiredSourceFiles)
        {
            var sourcePath = Path.Combine(candidate, relativePath);
            if (!File.Exists(sourcePath))
            {
                reason = $"Missing required file: {relativePath}";
                return false;
            }
        }

        var localeDirectory = Path.Combine(candidate, "locales");
        if (!Directory.Exists(localeDirectory))
        {
            reason = "Missing locales folder.";
            return false;
        }

        var localePakCount = Directory.EnumerateFiles(localeDirectory, "*.pak", SearchOption.TopDirectoryOnly)
            .Take(MinimumLocalePakCount)
            .Count();
        if (localePakCount < MinimumLocalePakCount)
        {
            reason = $"Too few locale files ({localePakCount}).";
            return false;
        }

        var sourceFileCount = safeFiles.Count;
        if (sourceFileCount < MinimumSourceFileCount)
        {
            reason = $"Too few files in payload ({sourceFileCount}).";
            return false;
        }

        return true;
    }

    private static void ValidateSourceFileSet(int previousFileCount, int currentFileCount)
    {
        if (currentFileCount < MinimumSourceFileCount)
        {
            throw new InvalidOperationException(
                $"The update payload appears incomplete ({currentFileCount} files found, expected at least {MinimumSourceFileCount}).");
        }

        if (previousFileCount < MinimumSourceFileCount)
        {
            return;
        }

        var minimumExpected = Math.Max(
            MinimumSourceFileCount,
            (int)Math.Floor(previousFileCount * MinimumManifestRetentionRatio));

        if (currentFileCount < minimumExpected)
        {
            throw new InvalidOperationException(
                $"The update payload appears incomplete ({currentFileCount} files found, expected at least {minimumExpected} based on the previous install manifest).");
        }
    }

    private static bool FilesMatch(string sourcePath, string destinationPath)
    {
        var sourceInfo = new FileInfo(sourcePath);
        var destinationInfo = new FileInfo(destinationPath);
        if (sourceInfo.Length != destinationInfo.Length)
        {
            return false;
        }

        using var sourceStream = File.OpenRead(sourcePath);
        using var destinationStream = File.OpenRead(destinationPath);
        var sourceHash = SHA256.HashData(sourceStream);
        var destinationHash = SHA256.HashData(destinationStream);
        return sourceHash.SequenceEqual(destinationHash);
    }

    private static HashSet<string> LoadManifest(string manifestPath, string installDirectory)
    {
        if (!File.Exists(manifestPath))
        {
            return new HashSet<string>(PathComparer);
        }

        var files = new HashSet<string>(PathComparer);
        foreach (var line in File.ReadAllLines(manifestPath, Encoding.UTF8))
        {
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            files.Add(GetSafeRelativePath(installDirectory, line, "installed file manifest"));
        }

        return files;
    }

    private static void SaveManifest(string manifestPath, IEnumerable<string> currentFiles)
    {
        var content = currentFiles
            .OrderBy(path => path, PathComparer)
            .ToArray();

        AtomicWriteAllText(manifestPath, string.Join(Environment.NewLine, content) + Environment.NewLine);
    }

    private static int RemoveStaleFiles(
        string installDirectory,
        IReadOnlySet<string> previousFiles,
        IReadOnlySet<string> currentFiles)
    {
        if (previousFiles.Count == 0)
        {
            return 0;
        }

        var normalizedInstallDirectory = NormalizeDirectory(installDirectory);
        EnsureTreeContainsNoReparsePoints(normalizedInstallDirectory, "installed app");
        var removedCount = 0;
        var candidateDirectories = new HashSet<string>(PathComparer);

        foreach (var previousRelativePath in previousFiles)
        {
            if (currentFiles.Contains(previousRelativePath))
            {
                continue;
            }

            var safeRelativePath = GetSafeRelativePath(normalizedInstallDirectory, previousRelativePath, "installed file manifest");
            var destinationFilePath = ResolveContainedPath(normalizedInstallDirectory, safeRelativePath, "stale installed file");
            if (!File.Exists(destinationFilePath))
            {
                continue;
            }

            File.Delete(destinationFilePath);
            removedCount++;

            var directoryPath = Path.GetDirectoryName(destinationFilePath);
            while (!string.IsNullOrWhiteSpace(directoryPath) && !PathComparer.Equals(directoryPath, normalizedInstallDirectory))
            {
                candidateDirectories.Add(directoryPath);
                directoryPath = Path.GetDirectoryName(directoryPath);
            }
        }

        foreach (var directoryPath in candidateDirectories.OrderByDescending(path => path.Length))
        {
            if (Directory.Exists(directoryPath) && !Directory.EnumerateFileSystemEntries(directoryPath).Any())
            {
                Directory.Delete(directoryPath);
            }
        }

        return removedCount;
    }

    private static void TryDeleteDirectory(string directoryPath)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(directoryPath) || !Directory.Exists(directoryPath))
            {
                return;
            }

            var normalizedDirectory = NormalizeDirectory(directoryPath);
            var secureRoot = GetSecureTransactionRoot();
            if (!normalizedDirectory.StartsWith(secureRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            {
                Log($"Refused to remove a directory outside the secure updater transaction root: {normalizedDirectory}");
                return;
            }

            EnsureTreeContainsNoReparsePoints(normalizedDirectory, "updater temporary directory");
            Directory.Delete(normalizedDirectory, recursive: true);
        }
        catch (Exception ex)
        {
            Log($"Could not remove temporary update folder: {ex.Message}");
        }
    }

    private static void LaunchInstalledApp(string installDirectory)
    {
        var executablePath = Path.Combine(installDirectory, ProductExecutableName);
        if (!File.Exists(executablePath))
        {
            throw new FileNotFoundException("The updated NexPlay executable was not found.", executablePath);
        }

        using var process = Process.Start(new ProcessStartInfo
        {
            FileName = executablePath,
            WorkingDirectory = installDirectory,
            UseShellExecute = true
        });

        if (process is null)
        {
            throw new InvalidOperationException("The updated NexPlay app could not be launched.");
        }
    }

    private static bool TryLaunchAfterCommittedOperation(
        string installDirectory,
        bool silent,
        IUpdaterUi? ui,
        string operation)
    {
        try
        {
            LaunchInstalledApp(installDirectory);
            return true;
        }
        catch (Exception ex)
        {
            Log($"The {operation} committed successfully, but NexPlay could not be launched: {ex}");
            try
            {
                ShowMessage(
                    $"NexPlay was {operation switch { "recovery" => "restored", _ => "updated" }} successfully, but it could not be launched automatically.{Environment.NewLine}{Environment.NewLine}{ex.Message}",
                    MessageBoxIcon.Warning,
                    silent,
                    ui);
            }
            catch (Exception notificationError)
            {
                Log($"Could not display the post-{operation} launch warning: {notificationError}");
            }
            return false;
        }
    }

    private static void ShowMessage(
        string message,
        MessageBoxIcon icon,
        bool silent,
        IUpdaterUi? ui = null)
    {
        if (silent)
        {
            return;
        }

        if (ui is not null)
        {
            var title = icon == MessageBoxIcon.Error
                ? "Update failed"
                : message.Contains("up to date", StringComparison.OrdinalIgnoreCase)
                    ? "NexPlay is up to date"
                    : "Updater status";
            ui.MessageAndWait(title, message, icon == MessageBoxIcon.Error);
            return;
        }

        MessageBox.Show(
            message,
            UpdaterDisplayName,
            MessageBoxButtons.OK,
            icon);
    }

    private static void RelaunchElevated()
    {
        var executablePath = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(executablePath))
        {
            throw new InvalidOperationException("The updater executable path could not be resolved.");
        }

        var arguments = BuildArgumentList(Environment.GetCommandLineArgs().Skip(1));
        using var process = Process.Start(new ProcessStartInfo
        {
            FileName = executablePath,
            Arguments = arguments,
            UseShellExecute = true,
            Verb = "runas"
        });

        if (process is null)
        {
            throw new InvalidOperationException("The updater could not be relaunched as administrator.");
        }
    }

    private static string BuildArgumentList(IEnumerable<string> args)
    {
        return string.Join(" ", args.Select(QuoteArgument));
    }

    private static string QuoteArgument(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return "\"\"";
        }

        if (!value.Any(char.IsWhiteSpace) && !value.Contains('"'))
        {
            return value;
        }

        return "\"" + value.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
    }

    private static bool TryParseCommandFilePath(string commandText, out string filePath)
    {
        filePath = string.Empty;
        if (string.IsNullOrWhiteSpace(commandText))
        {
            return false;
        }

        try
        {
            var parsed = ParseCommand(commandText);
            filePath = NormalizePath(parsed.FileName);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static bool TryParseDisplayIconPath(string displayIcon, out string filePath)
    {
        filePath = string.Empty;
        if (string.IsNullOrWhiteSpace(displayIcon))
        {
            return false;
        }

        var trimmed = displayIcon.Trim();
        var commaIndex = trimmed.IndexOf(',');
        if (commaIndex >= 0)
        {
            trimmed = trimmed[..commaIndex];
        }

        trimmed = trimmed.Trim().Trim('"');
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return false;
        }

        filePath = NormalizePath(trimmed);
        return true;
    }

    private static (string FileName, string Arguments) ParseCommand(string commandText)
    {
        var trimmed = commandText.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            throw new InvalidOperationException("Command text is empty.");
        }

        if (trimmed.StartsWith("\"", StringComparison.Ordinal))
        {
            var endQuote = trimmed.IndexOf('"', 1);
            if (endQuote <= 1)
            {
                throw new InvalidOperationException($"Could not parse command: {commandText}");
            }

            return (trimmed[1..endQuote], trimmed[(endQuote + 1)..].Trim());
        }

        var firstSpace = trimmed.IndexOf(' ');
        return firstSpace < 0
            ? (trimmed, string.Empty)
            : (trimmed[..firstSpace], trimmed[(firstSpace + 1)..].Trim());
    }

    private static void AddCandidate(ICollection<string> candidates, string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return;
        }

        var normalized = NormalizeDirectory(path);
        if (!candidates.Contains(normalized, PathComparer))
        {
            candidates.Add(normalized);
        }
    }

    private static string NormalizeDirectory(string path)
    {
        return NormalizePath(path).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
    }

    private static string NormalizePath(string path)
    {
        return Path.GetFullPath(path);
    }

    private static string GetSecureTransactionRoot()
    {
        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (string.IsNullOrWhiteSpace(localAppData) || !Directory.Exists(localAppData))
        {
            throw new InvalidOperationException("The current user's local application-data folder could not be resolved for updater recovery files.");
        }

        return EnsureSecureDirectoryPath(localAppData, "NexPlay", "UpdaterTransactions");
    }

    private static string EnsureSecureDirectoryPath(string trustedBaseDirectory, params string[] childNames)
    {
        var normalizedBase = NormalizeDirectory(trustedBaseDirectory);
        EnsurePathComponentsContainNoReparsePoints(normalizedBase, "secure updater directory");
        var current = normalizedBase;
        foreach (var childName in childNames)
        {
            if (string.IsNullOrWhiteSpace(childName)
                || childName is "." or ".."
                || childName.IndexOfAny(new[] { Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar }) >= 0
                || childName.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
            {
                throw new InvalidOperationException($"The updater temporary directory name is unsafe: {childName}");
            }

            current = ResolveContainedPath(normalizedBase, Path.GetRelativePath(normalizedBase, Path.Combine(current, childName)), "secure updater directory");
            if (Directory.Exists(current))
            {
                if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                {
                    throw new InvalidOperationException($"The secure updater directory cannot be a junction, symbolic link, or other reparse point: {current}");
                }
            }
            else
            {
                Directory.CreateDirectory(current);
                if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                {
                    throw new InvalidOperationException($"The secure updater directory became an unsafe reparse point: {current}");
                }
            }
        }

        EnsurePathComponentsContainNoReparsePoints(current, "secure updater directory");
        return NormalizeDirectory(current);
    }

    private static string CreateSecureWorkingDirectory(string prefix)
    {
        if (string.IsNullOrWhiteSpace(prefix) || !Regex.IsMatch(prefix, "^[a-z0-9-]+$", RegexOptions.IgnoreCase))
        {
            throw new InvalidOperationException("The updater working-directory prefix is invalid.");
        }

        var root = GetSecureTransactionRoot();
        var directory = ResolveContainedPath(root, $"{prefix}-{Guid.NewGuid():N}", "updater working directory");
        Directory.CreateDirectory(directory);
        EnsureTreeContainsNoReparsePoints(directory, "updater working directory");
        return directory;
    }

    private static HashSet<string> EnumerateSafeRelativeFiles(string rootDirectory)
    {
        var normalizedRoot = NormalizeDirectory(rootDirectory);
        EnsurePathComponentsContainNoReparsePoints(normalizedRoot, "directory root");
        var files = new HashSet<string>(PathComparer);
        var pendingDirectories = new Stack<string>();
        pendingDirectories.Push(normalizedRoot);

        while (pendingDirectories.Count > 0)
        {
            var directory = pendingDirectories.Pop();
            foreach (var entryPath in Directory.EnumerateFileSystemEntries(directory))
            {
                var attributes = File.GetAttributes(entryPath);
                if ((attributes & FileAttributes.ReparsePoint) != 0)
                {
                    throw new InvalidOperationException($"Update paths cannot contain junctions, symbolic links, or other reparse points: {entryPath}");
                }

                if ((attributes & FileAttributes.Directory) != 0)
                {
                    pendingDirectories.Push(entryPath);
                    continue;
                }

                var relativePath = GetSafeRelativePath(normalizedRoot, Path.GetRelativePath(normalizedRoot, entryPath), "file tree");
                files.Add(relativePath);
            }
        }

        return files;
    }

    private static void EnsureTreeContainsNoReparsePoints(string rootDirectory, string label)
    {
        try
        {
            _ = EnumerateSafeRelativeFiles(rootDirectory);
        }
        catch (Exception ex) when (ex is not InvalidOperationException)
        {
            throw new InvalidOperationException($"The {label} could not be checked for unsafe filesystem links.", ex);
        }
    }

    private static void EnsurePathComponentsContainNoReparsePoints(string path, string label)
    {
        var current = new DirectoryInfo(NormalizeDirectory(path));
        while (current is not null)
        {
            if (current.Exists && (current.Attributes & FileAttributes.ReparsePoint) != 0)
            {
                throw new InvalidOperationException($"The {label} cannot pass through a junction, symbolic link, or other reparse point: {current.FullName}");
            }
            current = current.Parent;
        }
    }

    private static string GetSafeRelativePath(string rootDirectory, string path, string label)
    {
        var rawPath = path.Trim();
        if (string.IsNullOrWhiteSpace(rawPath)
            || Path.IsPathRooted(rawPath)
            || rawPath.IndexOfAny(Path.GetInvalidPathChars()) >= 0)
        {
            throw new InvalidOperationException($"The {label} contains an unsafe path: {path}");
        }

        var resolvedPath = ResolveContainedPath(rootDirectory, rawPath, label);
        var relativePath = Path.GetRelativePath(NormalizeDirectory(rootDirectory), resolvedPath);
        if (string.Equals(relativePath, ".", StringComparison.Ordinal)
            || Path.IsPathRooted(relativePath)
            || relativePath.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar).Any(part => part == ".."))
        {
            throw new InvalidOperationException($"The {label} contains an unsafe path: {path}");
        }

        return NormalizeRelativePath(relativePath);
    }

    private static string ResolveContainedPath(string rootDirectory, string relativePath, string label)
    {
        var normalizedRoot = NormalizeDirectory(rootDirectory);
        var candidatePath = NormalizePath(Path.Combine(normalizedRoot, relativePath));
        if (!candidatePath.StartsWith(normalizedRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException($"The {label} path escapes the NexPlay directory: {relativePath}");
        }

        return candidatePath;
    }

    private static void AtomicWriteAllText(string destinationPath, string content)
    {
        var directory = Path.GetDirectoryName(destinationPath)
            ?? throw new InvalidOperationException("The updater metadata destination directory could not be resolved.");
        Directory.CreateDirectory(directory);
        var temporaryPath = Path.Combine(directory, $".{Path.GetFileName(destinationPath)}.{Guid.NewGuid():N}.tmp");
        try
        {
            var bytes = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false).GetBytes(content);
            using (var stream = new FileStream(
                temporaryPath,
                FileMode.CreateNew,
                FileAccess.Write,
                FileShare.None,
                4096,
                FileOptions.WriteThrough))
            {
                stream.Write(bytes, 0, bytes.Length);
                stream.Flush(flushToDisk: true);
            }

            File.Move(temporaryPath, destinationPath, overwrite: true);
        }
        finally
        {
            try
            {
                if (File.Exists(temporaryPath))
                {
                    File.Delete(temporaryPath);
                }
            }
            catch
            {
                // A failed metadata write is reported by the original exception.
            }
        }
    }

    private static string NormalizeRelativePath(string path)
    {
        return path.Replace(Path.AltDirectorySeparatorChar, Path.DirectorySeparatorChar).TrimStart(Path.DirectorySeparatorChar);
    }

    private static bool IsPathNestedInside(string candidatePath, string rootPath)
    {
        var normalizedCandidate = NormalizeDirectory(candidatePath);
        var normalizedRoot = NormalizeDirectory(rootPath);
        return normalizedCandidate.StartsWith(normalizedRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsAdministrator()
    {
        using var identity = WindowsIdentity.GetCurrent();
        var principal = new WindowsPrincipal(identity);
        return principal.IsInRole(WindowsBuiltInRole.Administrator);
    }

    private static void BeginLog(IEnumerable<string> args)
    {
        try
        {
            File.AppendAllText(
                LogPath,
                $"{Environment.NewLine}===== {DateTime.Now:yyyy-MM-dd HH:mm:ss} ====={Environment.NewLine}Args: {string.Join(" ", args.Select(QuoteArgument))}{Environment.NewLine}",
                Encoding.UTF8);
        }
        catch
        {
        }
    }

    private static void Log(string message)
    {
        try
        {
            File.AppendAllText(
                LogPath,
                $"[{DateTime.Now:HH:mm:ss}] {message}{Environment.NewLine}",
                Encoding.UTF8);
        }
        catch
        {
        }
    }
}

internal sealed class InstallMutexLease : IDisposable
{
    private Mutex? _mutex;

    public InstallMutexLease(Mutex mutex)
    {
        _mutex = mutex;
    }

    public void Dispose()
    {
        var mutex = Interlocked.Exchange(ref _mutex, null);
        if (mutex is null)
        {
            return;
        }

        try
        {
            mutex.ReleaseMutex();
        }
        finally
        {
            mutex.Dispose();
        }
    }
}

internal sealed class UpdateTransactionContext
{
    public UpdateTransactionContext(
        string directoryPath,
        string backupDirectory,
        string journalPath,
        UpdateTransactionJournal journal)
    {
        DirectoryPath = directoryPath;
        BackupDirectory = backupDirectory;
        JournalPath = journalPath;
        Journal = journal;
    }

    public string DirectoryPath { get; }
    public string BackupDirectory { get; }
    public string JournalPath { get; }
    public UpdateTransactionJournal Journal { get; }
}

internal sealed class UpdateTransactionJournal
{
    public string? TransactionId { get; set; }
    public string? InstallIdentity { get; set; }
    public string? InstallDirectory { get; set; }
    public string? State { get; set; }
    public bool WasAppRunning { get; set; }
    public int BackupFileCount { get; set; }
    public string? BackupSha256 { get; set; }
    public string? CreatedAt { get; set; }
    public string? UpdatedAt { get; set; }
}

internal sealed record DirectoryIntegrity(int FileCount, string Sha256);

internal sealed record InstalledAppEntry(
    string DisplayName,
    string DisplayVersion,
    string UninstallCommand,
    string InstallLocation,
    string DisplayIcon,
    Version Version);

internal sealed record UpdateResult(int SyncedFiles, int RemovedFiles);

internal sealed class AppliedReleaseReceipt
{
    public string? Version { get; set; }
    public string? ArtifactSha256 { get; set; }
    public long? ArtifactSize { get; set; }
    public string? PublishedAt { get; set; }
    public string? ManifestLocation { get; set; }
    public string? ArtifactLocation { get; set; }
    public string? InstalledAt { get; set; }
}

internal sealed class RemoteUpdatePlan
{
    public string ManifestLocation { get; init; } = string.Empty;
    public string ArtifactLocation { get; init; } = string.Empty;
    public string VersionLabel { get; init; } = string.Empty;
    public Version LatestVersion { get; init; } = new(0, 0, 0, 0);
    public bool UpdateAvailable { get; init; }
    public bool AppliedReleaseReceiptCurrent { get; init; }
    public string? AppliedReleaseVersionLabel { get; init; }
    public string? Notes { get; init; }
    public string? PublishedAt { get; init; }
    public string? Sha256 { get; init; }
    public long? ExpectedSize { get; init; }
    public string? TemporaryDirectory { get; set; }
}

internal sealed class UpdateManifest
{
    public string? Version { get; set; }
    public string? PubDate { get; set; }
    public string? Notes { get; set; }
    public string? Url { get; set; }
    public string? Sha256 { get; set; }
    public long? Size { get; set; }
    public Dictionary<string, UpdateArtifact>? Platforms { get; set; }
}

internal sealed class UpdateArtifact
{
    public string? Version { get; set; }
    public string? PubDate { get; set; }
    public string? Notes { get; set; }
    public string? Url { get; set; }
    public string? Sha256 { get; set; }
    public long? Size { get; set; }
}

internal sealed class UpdateFeedConfig
{
    public string? ManifestUrl { get; set; }
    public string? UpdateManifestUrl { get; set; }
    public string? LatestJsonUrl { get; set; }
}

internal enum ElevationResult
{
    NotNeeded,
    Cancelled,
    Relaunched
}

internal sealed record UpdaterOptions(
    string? SourceDirectory,
    string? InstallDirectory,
    bool Silent,
    bool RelaunchAfterUpdate,
    string? ManifestUrl,
    bool CheckOnly,
    bool Force,
    bool AllowInsecureUpdateUrl,
    bool NoUi)
{
    public static UpdaterOptions Parse(IReadOnlyList<string> args)
    {
        string? sourceDirectory = null;
        string? installDirectory = null;
        string? manifestUrl = null;
        var silent = false;
        var relaunchAfterUpdate = true;
        var checkOnly = false;
        var force = false;
        var allowInsecureUpdateUrl = false;
        var noUi = false;

        for (var index = 0; index < args.Count; index++)
        {
            var argument = args[index];
            switch (argument.ToLowerInvariant())
            {
                case "--source":
                case "/source":
                    if (index + 1 >= args.Count)
                    {
                        throw new InvalidOperationException("Missing value after --source.");
                    }

                    sourceDirectory = args[++index];
                    break;

                case "--install-dir":
                case "--target":
                case "/install-dir":
                case "/target":
                    if (index + 1 >= args.Count)
                    {
                        throw new InvalidOperationException("Missing value after --install-dir.");
                    }

                    installDirectory = args[++index];
                    break;

                case "--manifest-url":
                case "--update-url":
                case "/manifest-url":
                case "/update-url":
                    if (index + 1 >= args.Count)
                    {
                        throw new InvalidOperationException("Missing value after --manifest-url.");
                    }

                    manifestUrl = args[++index];
                    break;

                case "--check":
                case "--check-only":
                case "/check":
                case "/check-only":
                    checkOnly = true;
                    break;

                case "--force":
                case "/force":
                    force = true;
                    break;

                case "--allow-insecure-update-url":
                case "/allow-insecure-update-url":
                    allowInsecureUpdateUrl = true;
                    break;

                case "--no-ui":
                case "/no-ui":
                    noUi = true;
                    break;

                case "--silent":
                case "/silent":
                    silent = true;
                    break;

                case "--no-relaunch":
                case "/no-relaunch":
                case "--skip-launch":
                case "/skip-launch":
                    relaunchAfterUpdate = false;
                    break;

                default:
                    if (sourceDirectory is null && Directory.Exists(argument))
                    {
                        sourceDirectory = argument;
                        break;
                    }

                    throw new InvalidOperationException($"Unknown argument: {argument}");
            }
        }

        return new UpdaterOptions(
            sourceDirectory,
            installDirectory,
            silent,
            relaunchAfterUpdate,
            manifestUrl,
            checkOnly,
            force,
            allowInsecureUpdateUrl,
            noUi);
    }
}
