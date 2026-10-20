using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;

namespace AstraMentoringAPI;

// Short-lived emailed codes for "Forgot password". One pending code per user,
// held in memory (single API instance) — a restart just invalidates pending
// codes and the user requests a new one. Codes are stored hashed, compared in
// constant time, and burn after too many wrong guesses.
public sealed class PasswordResetStore
{
    public const int MaxAttempts = 5;
    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(10);
    public static readonly TimeSpan ResendCooldown = TimeSpan.FromSeconds(60);

    public enum VerifyStatus { Ok, Invalid, Expired, TooManyAttempts }

    private sealed class Entry
    {
        public byte[] CodeHash = Array.Empty<byte>();
        public DateTimeOffset ExpiresAt;
        public DateTimeOffset LastSentAt;
        public int Attempts;
    }

    private readonly ConcurrentDictionary<int, Entry> _entries = new();

    private static byte[] Hash(string code) => SHA256.HashData(Encoding.UTF8.GetBytes(code));

    private void Purge()
    {
        var now = DateTimeOffset.UtcNow;
        foreach (var kv in _entries)
            if (kv.Value.ExpiresAt <= now) _entries.TryRemove(kv.Key, out _);
    }

    // Returns null when a code was already sent within the cooldown (the
    // caller should stay silent — the response is the same either way).
    public string? TryCreate(int userId)
    {
        Purge();
        var now = DateTimeOffset.UtcNow;
        if (_entries.TryGetValue(userId, out var existing) && existing.LastSentAt + ResendCooldown > now)
            return null;

        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
        _entries[userId] = new Entry { CodeHash = Hash(code), ExpiresAt = now + Lifetime, LastSentAt = now };
        return code;
    }

    public VerifyStatus Verify(int userId, string? code)
    {
        if (!_entries.TryGetValue(userId, out var e)) return VerifyStatus.Expired;
        lock (e)
        {
            if (e.ExpiresAt <= DateTimeOffset.UtcNow) { _entries.TryRemove(userId, out _); return VerifyStatus.Expired; }
            if (e.Attempts >= MaxAttempts) { _entries.TryRemove(userId, out _); return VerifyStatus.TooManyAttempts; }

            e.Attempts++;
            if (!CryptographicOperations.FixedTimeEquals(Hash((code ?? string.Empty).Trim()), e.CodeHash))
            {
                if (e.Attempts >= MaxAttempts) { _entries.TryRemove(userId, out _); return VerifyStatus.TooManyAttempts; }
                return VerifyStatus.Invalid;
            }

            _entries.TryRemove(userId, out _);
            return VerifyStatus.Ok;
        }
    }
}
