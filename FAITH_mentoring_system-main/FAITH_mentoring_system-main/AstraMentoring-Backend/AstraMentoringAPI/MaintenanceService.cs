using AstraMentoring_Backend.Services;

namespace AstraMentoringAPI;

// Maintenance switches for the Mentor and Mentee portals (set by Admin on the Settings page).
// Stored in SystemSettings and cached briefly so the per-request check is cheap.
public sealed record MaintenanceInfo(bool Mentor, bool Mentee, string? Eta, string Message)
{
    public bool Any => Mentor || Mentee;

    public bool Blocks(string? role) =>
        (string.Equals(role, "Mentor", StringComparison.OrdinalIgnoreCase) && Mentor) ||
        (string.Equals(role, "Mentee", StringComparison.OrdinalIgnoreCase) && Mentee);

    // Body returned (HTTP 503) to a blocked user; the web app turns it into the maintenance screen.
    public object Payload(string? role) => new
    {
        maintenance = true,
        role,
        message = $"The {role} portal is under maintenance.",
        detail = Message,
        eta = Eta
    };
}

public sealed class MaintenanceService
{
    public const string KeyMentor = "MaintenanceMentor";
    public const string KeyMentee = "MaintenanceMentee";
    public const string KeyEta = "MaintenanceEta";
    public const string KeyMessage = "MaintenanceMessage";

    private static readonly TimeSpan CacheFor = TimeSpan.FromSeconds(5);
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<MaintenanceService> _logger;
    private MaintenanceInfo? _cached;
    private DateTimeOffset _cachedAt;

    public MaintenanceService(IServiceScopeFactory scopes, ILogger<MaintenanceService> logger)
    {
        _scopes = scopes;
        _logger = logger;
    }

    public void Invalidate() => _cached = null;

    public async Task<MaintenanceInfo> GetAsync()
    {
        var now = DateTimeOffset.UtcNow;
        if (_cached != null && now - _cachedAt < CacheFor) return _cached;
        try
        {
            using var scope = _scopes.CreateScope();
            var all = await scope.ServiceProvider.GetRequiredService<SettingsService>().GetAllAsync();
            string Get(string k) => all.TryGetValue(k, out var v) ? (v ?? string.Empty).Trim() : string.Empty;
            var eta = Get(KeyEta);
            _cached = new MaintenanceInfo(Get(KeyMentor) == "1", Get(KeyMentee) == "1", eta.Length == 0 ? null : eta, Get(KeyMessage));
            _cachedAt = now;
        }
        catch (Exception ex)
        {
            // A settings lookup problem must never lock people out.
            _logger.LogWarning(ex, "Could not read maintenance settings.");
            return _cached ?? new MaintenanceInfo(false, false, null, string.Empty);
        }
        return _cached;
    }
}
