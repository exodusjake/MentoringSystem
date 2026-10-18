using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using System.Security.Claims;

namespace AstraMentoringAPI.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class ESignatureController : ControllerBase
    {
        private readonly string _connectionString;
        private readonly IWebHostEnvironment _env;
        private readonly ILogger<ESignatureController>? _logger;

        public ESignatureController(IConfiguration config, IWebHostEnvironment env, ILogger<ESignatureController>? logger = null)
        {
            _connectionString = config.GetConnectionString("DefaultConnection")
                ?? "Server=(localdb)\\MSSQLLocalDB;Database=AstraMentoring;Trusted_Connection=True;MultipleActiveResultSets=True";
            _env = env;
            _logger = logger;
        }

        private int CallerId => int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        // Every caller in the app only ever fetches/uploads/deletes their
        // own signature — there's no "view a colleague's signature" or
        // admin-override feature. {userId} in the route must match the
        // caller's own JWT identity, or this would let any signed-in
        // account read, replace, or delete anyone else's signature just
        // by knowing their user ID.
        private bool IsSelf(int userId) => userId == CallerId;

        private async Task<string?> GetUserRole(SqlConnection conn, int userId)
            => await conn.ExecuteScalarAsync<string?>(
                "SELECT Role FROM Users WHERE UserID = @UserID",
                new { UserID = userId });

        private (string selectSql, string updateSql, string notFoundMsg) GetProfileSqls(string role)
        {
            if (role.Equals("Mentor", StringComparison.OrdinalIgnoreCase))
                return (
                    "SELECT SignatureFilePath FROM MentorProfiles WHERE UserID = @UserID",
                    "UPDATE MentorProfiles SET SignatureFilePath = @Path WHERE UserID = @UserID",
                    "Mentor profile not found."
                );
            if (role.Equals("Mentee", StringComparison.OrdinalIgnoreCase))
                return (
                    "SELECT SignatureFilePath FROM MenteeProfiles WHERE UserID = @UserID",
                    "UPDATE MenteeProfiles SET SignatureFilePath = @Path WHERE UserID = @UserID",
                    "Mentee profile not found."
                );
            // Admin and Head have no dedicated profile table — read/write
            // straight off Users.
            return (
                "SELECT SignatureFilePath FROM Users WHERE UserID = @UserID",
                "UPDATE Users SET SignatureFilePath = @Path WHERE UserID = @UserID",
                "User not found."
            );
        }

        [HttpGet("{userId}")]
        public async Task<IActionResult> Get(int userId)
        {
            if (!IsSelf(userId)) return Forbid();

            using var conn = new SqlConnection(_connectionString);
            var role = await GetUserRole(conn, userId) ?? "Mentee";
            var (selectSql, _, _) = GetProfileSqls(role);
            var path = await conn.ExecuteScalarAsync<string?>(selectSql, new { UserID = userId });
            return Ok(new { signatureFilePath = path });
        }

        [HttpPost("{userId}")]
        [Consumes("multipart/form-data")]
        public async Task<IActionResult> Upload(int userId, IFormFile file)
        {
            if (!IsSelf(userId)) return Forbid();

            if (file == null || file.Length == 0)
                return BadRequest(new { message = "No file provided." });

            // PNG only, not any image type — a signature is printed over the
            // "over printed name" line on logsheets at a small size, so it
            // needs a transparent background to blend in cleanly instead of
            // showing a visible white/gray box around the strokes. JPG (and
            // GIF, WEBP-without-alpha) can't carry transparency at all, so
            // allowing them just meant every non-PNG upload was guaranteed
            // to print with a background box no amount of display styling
            // could remove.
            if (!file.ContentType.Equals("image/png", StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { message = "Please upload a PNG file with a transparent background." });

            var ext = ".png";

            if (file.Length > 5 * 1024 * 1024)
                return BadRequest(new { message = "File too large. Maximum size is 5 MB." });

            var webRoot = _env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
            var folder  = Path.Combine(webRoot, "uploads", "signatures");
            Directory.CreateDirectory(folder);

            var fileName = $"sig_{userId}_{Guid.NewGuid()}{ext}";
            var fullPath = Path.Combine(folder, fileName);

            var relPath = $"/uploads/signatures/{fileName}";
            string? oldPath;
            try
            {
                using (var stream = new FileStream(fullPath, FileMode.CreateNew))
                    await file.CopyToAsync(stream);

                using var conn = new SqlConnection(_connectionString);
                await conn.OpenAsync();
                using var tx = conn.BeginTransaction(System.Data.IsolationLevel.Serializable);
                var role = await conn.ExecuteScalarAsync<string?>(
                    "SELECT Role FROM Users WITH (UPDLOCK,HOLDLOCK) WHERE UserID=@UserID", new { UserID=userId }, tx);
                if (role == null)
                {
                    TryDeleteSignature(fullPath);
                    return NotFound(new { message = "User not found." });
                }
                var (selectSql, updateSql, notFoundMsg) = GetProfileSqls(role);
                oldPath = await conn.ExecuteScalarAsync<string?>(selectSql.Replace(" WHERE", " WITH (UPDLOCK,HOLDLOCK) WHERE"), new { UserID=userId }, tx);
                var rows = await conn.ExecuteAsync(updateSql, new { Path=relPath, UserID=userId }, tx);
                if (rows == 0)
                {
                    TryDeleteSignature(fullPath);
                    return NotFound(new { message = notFoundMsg });
                }
                tx.Commit();
            }
            catch
            {
                TryDeleteSignature(fullPath);
                throw;
            }
            // Remove the old file only after its replacement is safely committed.
            // Cleanup failure must not make a successful upload appear to fail.
            if (!string.IsNullOrEmpty(oldPath))
                TryDeleteSignature(Path.Combine(webRoot, oldPath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar)));
            return Ok(new { signatureFilePath = relPath });
        }

        private void TryDeleteSignature(string path)
        {
            try { if (System.IO.File.Exists(path)) System.IO.File.Delete(path); }
            catch (IOException ex) { _logger?.LogWarning(ex, "Signature file cleanup failed."); }
            catch (UnauthorizedAccessException ex) { _logger?.LogWarning(ex, "Signature file cleanup failed."); }
        }

        [HttpDelete("{userId}")]
        public async Task<IActionResult> Delete(int userId)
        {
            if (!IsSelf(userId)) return Forbid();

            using var conn = new SqlConnection(_connectionString);
            var webRoot = _env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");

            var role = await GetUserRole(conn, userId) ?? "Mentee";
            // Reuse the same 3-way branch generate/upload already use — a
            // hand-rolled Mentor/else ternary here used to silently clear
            // the wrong table (MenteeProfiles) for an Admin or Head user.
            var (selectSql, clearSql, _) = GetProfileSqls(role);

            var oldPath = await conn.ExecuteScalarAsync<string?>(selectSql, new { UserID = userId });
            if (!string.IsNullOrEmpty(oldPath))
            {
                var oldFull = Path.Combine(webRoot, oldPath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));
                if (System.IO.File.Exists(oldFull)) System.IO.File.Delete(oldFull);
            }

            await conn.ExecuteAsync(clearSql, new { UserID = userId, Path = (string?)null });
            return Ok(new { message = "Signature removed." });
        }
    }
}
