using System.Collections.Concurrent;

namespace AstraMentoringAPI;

// Per-account login protection: 5 wrong passwords within a minute lock that
// email for a minute. Successful logins never count, so people sharing one
// Wi-Fi network don't block each other.
public sealed class LoginAttemptTracker
{
    public const int MaxFailures = 5;
    public static readonly TimeSpan Window = TimeSpan.FromMinutes(1);

    private sealed class Entry
    {
        public readonly Queue<DateTimeOffset> Failures = new();
        public DateTimeOffset? LockedUntil;
    }

    private readonly ConcurrentDictionary<string, Entry> _entries = new(StringComparer.Ordinal);
    private readonly Func<DateTimeOffset> _now;

    public LoginAttemptTracker() : this(() => DateTimeOffset.UtcNow) { }

    public LoginAttemptTracker(Func<DateTimeOffset> now) => _now = now;

    private static string Key(string? email) => (email ?? string.Empty).Trim().ToLowerInvariant();

    public bool IsLocked(string? email)
    {
        if (!_entries.TryGetValue(Key(email), out var entry)) return false;
        lock (entry) return entry.LockedUntil is { } until && until > _now();
    }

    public void RecordFailure(string? email)
    {
        var entry = _entries.GetOrAdd(Key(email), _ => new Entry());
        lock (entry)
        {
            var now = _now();
            if (entry.LockedUntil is { } until && until <= now) entry.LockedUntil = null;
            while (entry.Failures.Count > 0 && now - entry.Failures.Peek() >= Window) entry.Failures.Dequeue();
            entry.Failures.Enqueue(now);
            if (entry.Failures.Count >= MaxFailures)
            {
                entry.LockedUntil = now + Window;
                entry.Failures.Clear();
            }
        }
    }

    public void RecordSuccess(string? email) => _entries.TryRemove(Key(email), out _);
}
