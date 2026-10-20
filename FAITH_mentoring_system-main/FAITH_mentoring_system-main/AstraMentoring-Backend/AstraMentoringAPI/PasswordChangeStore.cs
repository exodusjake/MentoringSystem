using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;

namespace AstraMentoringAPI;

// Signed-in "change my password" flow: the user proves the current password,
// an emailed code is sent, entering it returns a short-lived token, and the
// token must accompany the actual password change. Held in memory (single API
// instance); codes are stored hashed and compared in constant time.
public sealed class PasswordChangeStore
{
    public const int MaxAttempts = 5;
    public static readonly TimeSpan CodeLifetime = TimeSpan.FromMinutes(10);
    public static readonly TimeSpan TokenLifetime = TimeSpan.FromMinutes(10);
    public static readonly TimeSpan ResendCooldown = TimeSpan.FromSeconds(45);

    public enum VerifyStatus { Ok, Invalid, Expired, TooManyAttempts }

    private sealed class Entry
    {
        public byte[] CodeHash = Array.Empty<byte>();
        public DateTimeOffset ExpiresAt;
        public DateTimeOffset LastSentAt;
        public int Attempts;
        public string? Token;
        public DateTimeOffset TokenExpiresAt;
    }

    private readonly ConcurrentDictionary<int, Entry> _entries = new();

    private static byte[] Hash(string s) => SHA256.HashData(Encoding.UTF8.GetBytes(s));

    private void Purge()
    {
        var now = DateTimeOffset.UtcNow;
        foreach (var kv in _entries)
            if (kv.Value.ExpiresAt <= now && kv.Value.TokenExpiresAt <= now) _entries.TryRemove(kv.Key, out _);
    }

    // Null when a code was sent within the cooldown; retryAfter says how long to wait.
    public string? TryCreateCode(int userId, out TimeSpan retryAfter)
    {
        Purge();
        retryAfter = TimeSpan.Zero;
        var now = DateTimeOffset.UtcNow;
        if (_entries.TryGetValue(userId, out var existing))
        {
            var wait = existing.LastSentAt + ResendCooldown - now;
            if (wait > TimeSpan.Zero) { retryAfter = wait; return null; }
        }
        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
        _entries[userId] = new Entry { CodeHash = Hash(code), ExpiresAt = now + CodeLifetime, LastSentAt = now };
        return code;
    }

    public VerifyStatus VerifyCode(int userId, string? code, out string? token)
    {
        token = null;
        if (!_entries.TryGetValue(userId, out var e)) return VerifyStatus.Expired;
        lock (e)
        {
            var now = DateTimeOffset.UtcNow;
            if (e.ExpiresAt <= now) { _entries.TryRemove(userId, out _); return VerifyStatus.Expired; }
            if (e.Attempts >= MaxAttempts) { _entries.TryRemove(userId, out _); return VerifyStatus.TooManyAttempts; }

            e.Attempts++;
            if (!CryptographicOperations.FixedTimeEquals(Hash((code ?? string.Empty).Trim()), e.CodeHash))
            {
                if (e.Attempts >= MaxAttempts) { _entries.TryRemove(userId, out _); return VerifyStatus.TooManyAttempts; }
                return VerifyStatus.Invalid;
            }

            e.ExpiresAt = now;                       // the code itself is single-use
            e.Token = Convert.ToHexString(RandomNumberGenerator.GetBytes(24));
            e.TokenExpiresAt = now + TokenLifetime;
            token = e.Token;
            return VerifyStatus.Ok;
        }
    }

    // True once, for the token issued by VerifyCode.
    public bool ConsumeToken(int userId, string? token)
    {
        if (string.IsNullOrEmpty(token) || !_entries.TryGetValue(userId, out var e)) return false;
        lock (e)
        {
            if (e.Token == null || e.TokenExpiresAt <= DateTimeOffset.UtcNow) return false;
            if (!CryptographicOperations.FixedTimeEquals(Hash(token), Hash(e.Token))) return false;
            _entries.TryRemove(userId, out _);
            return true;
        }
    }
}
