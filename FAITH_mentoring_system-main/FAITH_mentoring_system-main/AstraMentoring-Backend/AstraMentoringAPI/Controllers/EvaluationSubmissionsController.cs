using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using AstraMentoring_Backend.Services;

namespace AstraMentoringAPI.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class EvaluationSubmissionsController : ControllerBase
    {
        private readonly EvaluationSubmissionsService _service;
        private readonly IWebHostEnvironment          _env;
        public EvaluationSubmissionsController(EvaluationSubmissionsService service, IWebHostEnvironment env)
        {
            _service = service;
            _env     = env;
        }

        private int CallerId => int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        // GET /api/EvaluationSubmissions/mine — which forms has the calling
        // mentee already marked as submitted?
        [HttpGet("mine")]
        public async Task<IActionResult> GetMine()
            => Ok(await _service.GetMyLinkIdsAsync(CallerId));

        // GET /api/EvaluationSubmissions/summary — submitted/total count per
        // evaluation link, for Admin's card badge. Head Admin gets the same
        // read-only view on their own Evaluation Forms page.
        [HttpGet("summary")]
        [Authorize(Roles = "Admin,Head")]
        public async Task<IActionResult> GetSummary()
            => Ok(await _service.GetSummaryAsync());

        // GET /api/EvaluationSubmissions/{linkId} — full per-mentee
        // submitted/not-submitted breakdown for one form.
        [HttpGet("{linkId:int}")]
        [Authorize(Roles = "Admin,Head")]
        public async Task<IActionResult> GetDetail(int linkId)
            => Ok(await _service.GetDetailAsync(linkId));

        // POST /api/EvaluationSubmissions/upload — the calling mentee marks a
        // form as submitted BY uploading a proof screenshot; the upload itself
        // is the submit action, no separate confirm step. Safe to call again
        // (a re-upload just replaces the path/timestamp on the same row; the
        // old physical file is orphaned deliberately here since the normal UI
        // never re-uploads without an Undo in between, which already cleans
        // up — see Unmark below).
        [HttpPost("upload")]
        [Consumes("multipart/form-data")]
        public async Task<IActionResult> Upload([FromForm] int linkId, IFormFile file)
        {
            if (file == null || file.Length == 0)
                return BadRequest(new { message = "No file provided." });

            var allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                { ".jpg", ".jpeg", ".png", ".gif", ".webp" };
            var ext = Path.GetExtension(file.FileName);
            if (!allowed.Contains(ext))
                return BadRequest(new { message = "File type not allowed. Use JPG, PNG, GIF, or WEBP." });

            if (file.Length > 20 * 1024 * 1024)
                return BadRequest(new { message = "File too large. Maximum size is 20 MB." });

            var webRoot = _env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
            var folder  = Path.Combine(webRoot, "uploads", "eval-proof");
            Directory.CreateDirectory(folder);

            var fileName = $"{Guid.NewGuid()}{ext}";
            using (var stream = new FileStream(Path.Combine(folder, fileName), FileMode.Create))
                await file.CopyToAsync(stream);

            var relPath = $"/uploads/eval-proof/{fileName}";
            await _service.MarkSubmittedWithProofAsync(linkId, CallerId, relPath);
            return Ok(new { message = "Marked as submitted", proofFilePath = relPath });
        }

        // DELETE /api/EvaluationSubmissions/{linkId} — the calling mentee
        // undoes an accidental mark; also removes the proof file from disk.
        [HttpDelete("{linkId:int}")]
        public async Task<IActionResult> Unmark(int linkId)
        {
            var (found, proofPath) = await _service.UnmarkAsync(linkId, CallerId);
            if (!found) return NotFound();

            if (!string.IsNullOrWhiteSpace(proofPath))
            {
                try
                {
                    var webRoot  = _env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
                    var fullPath = Path.Combine(webRoot, proofPath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));
                    if (System.IO.File.Exists(fullPath)) System.IO.File.Delete(fullPath);
                }
                catch { /* best-effort cleanup — a stray file is harmless, failing the request isn't */ }
            }

            return Ok(new { message = "Mark removed" });
        }
    }
}
