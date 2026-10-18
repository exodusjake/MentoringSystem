using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Services;

namespace AstraMentoringAPI.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class ProofOfSessionController : ControllerBase
    {
        private readonly ProofOfSessionService _service;
        private readonly IWebHostEnvironment   _env;
        private readonly SessionsService _sessions;

        public ProofOfSessionController(ProofOfSessionService service, IWebHostEnvironment env, SessionsService sessions)
        {
            _service = service;
            _sessions = sessions;
            _env     = env;
        }

        private int CallerId => int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        // Unused by any portal's frontend (proof rosters are read through
        // SessionProofsAdminController instead) — restricted to staff/mentor
        // roles as a baseline.
        [HttpGet]
        [Authorize(Roles = "Mentor,Admin,Head")]
        public async Task<IActionResult> Get() => Ok(await _service.GetAll());

        [HttpGet("{id}")]
        [Authorize(Roles = "Mentor,Admin,Head")]
        public async Task<IActionResult> GetById(int id)
        {
            var result = await _service.GetById(id);
            return result is null ? NotFound() : Ok(result);
        }

        // File records must originate from a validated upload.
        [HttpPost]
        [Authorize(Roles = "Mentor")]
        public IActionResult Post([FromBody] ProofOfSession data)
            => BadRequest(new { message = "Use the proof upload endpoint." });

        [HttpPut("{id}")]
        [Authorize(Roles = "Mentor")]
        public IActionResult Put(int id, [FromBody] ProofOfSession data)
            => BadRequest(new { message = "Use the proof upload endpoint." });

        [HttpDelete("{id}")]
        [Authorize(Roles = "Mentor")]
        public async Task<IActionResult> Delete(int id)
        {
            var proof = await _service.GetById(id);
            if (proof == null) return NotFound();
            if ((await _sessions.GetById(proof.SessionID))?.MentorID != CallerId) return Forbid();
            var result = await _service.Delete(id);
            return result ? Ok(new { message = "Proof deleted" }) : NotFound();
        }

        // Only a mentor ever uploads proof for their own session. The
        // uploader's identity always comes from the caller's own JWT, never
        // the form body — otherwise anyone could attribute a proof upload
        // to a different user.
        [HttpPost("upload")]
        [Consumes("multipart/form-data")]
        [Authorize(Roles = "Mentor")]
        public async Task<IActionResult> Upload([FromForm] int sessionId, IFormFile file)
        {
            var session = await _sessions.GetById(sessionId);
            if (session?.MentorID != CallerId) return Forbid();
            if (session.Status == "Cancelled" || !await _sessions.HasScannedAttendanceAsync(sessionId))
                return BadRequest(new { message = "Proof can only be uploaded for a session with recorded QR attendance that has not been cancelled." });
            if (file == null || file.Length == 0)
                return BadRequest(new { message = "No file provided." });

            var allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                { ".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf" };
            var ext = Path.GetExtension(file.FileName);
            if (!allowed.Contains(ext))
                return BadRequest(new { message = "File type not allowed. Use JPG, PNG, GIF, WEBP, or PDF." });

            if (file.Length > 20 * 1024 * 1024)
                return BadRequest(new { message = "File too large. Maximum size is 20 MB." });

            var webRoot = _env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
            var folder  = Path.Combine(webRoot, "uploads", "proof");
            Directory.CreateDirectory(folder);

            var fileName = $"{Guid.NewGuid()}{ext}";
            using (var stream = new FileStream(Path.Combine(folder, fileName), FileMode.Create))
                await file.CopyToAsync(stream, HttpContext.RequestAborted);

            var relPath  = $"/uploads/proof/{fileName}";
            var imgExts  = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                { ".jpg", ".jpeg", ".png", ".gif", ".webp" };
            var fileType = imgExts.Contains(ext) ? "image" : "document";

            var proof = new ProofOfSession
            {
                SessionID        = sessionId,
                UploadedByUserID = CallerId,
                FilePath         = relPath,
                FileType         = fileType,
                UploadedAt       = DateTime.Now,
            };

            // The original path remains persisted until the complete new upload commits.
            // Never delete the original file, including on replacement failure.
            var ok = await _service.SaveUpload(proof, HttpContext.RequestAborted);
            return ok
                ? Ok(new { message = "Proof uploaded", filePath = relPath })
                : StatusCode(500, new { message = "Failed to save proof record." });
        }

        // Reached via plain <a href> download links across every portal, which
        // can't carry a Bearer token — stays open, same as this app already
        // does for the underlying static files under wwwroot/uploads/proof/.
        [HttpGet("download")]
        [AllowAnonymous]
        public IActionResult Download([FromQuery] string path)
        {
            if (string.IsNullOrWhiteSpace(path) || !path.StartsWith("/uploads/proof/", StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { message = "Invalid path." });

            var webRoot   = _env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
            // The StartsWith check above only looks at the raw string — "..\" segments
            // survive it and are resolved by the OS once File.Exists/PhysicalFile touch
            // disk, walking out of wwwroot/uploads/proof entirely. Resolving both paths
            // to their canonical absolute form and re-checking containment here is what
            // actually blocks traversal, regardless of how the ".." is encoded.
            var proofRoot = Path.GetFullPath(Path.Combine(webRoot, "uploads", "proof") + Path.DirectorySeparatorChar);
            var fullPath  = Path.GetFullPath(Path.Combine(webRoot, path.TrimStart('/').Replace('/', Path.DirectorySeparatorChar)));
            if (!fullPath.StartsWith(proofRoot, StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { message = "Invalid path." });
            if (!System.IO.File.Exists(fullPath)) return NotFound(new { message = "File not found." });

            var ext = Path.GetExtension(fullPath).ToLower();
            var contentType = ext switch
            {
                ".jpg" or ".jpeg" => "image/jpeg",
                ".png"  => "image/png",
                ".gif"  => "image/gif",
                ".webp" => "image/webp",
                ".pdf"  => "application/pdf",
                _       => "application/octet-stream",
            };
            var downloadName = $"proof{ext}";
            return PhysicalFile(fullPath, contentType, downloadName);
        }
    }
}
