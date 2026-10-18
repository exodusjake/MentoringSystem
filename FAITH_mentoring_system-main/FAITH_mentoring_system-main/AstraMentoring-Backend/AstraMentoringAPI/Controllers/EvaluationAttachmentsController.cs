using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Services;

namespace AstraMentoringAPI.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class EvaluationAttachmentsController : ControllerBase
    {
        private readonly EvaluationAttachmentsService _service;
        private readonly IWebHostEnvironment _env;

        public EvaluationAttachmentsController(EvaluationAttachmentsService service, IWebHostEnvironment env)
        {
            _service = service;
            _env = env;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll() =>
            Ok(await _service.GetAll());

        [HttpGet("link/{linkId}")]
        public async Task<IActionResult> GetByLink(int linkId) =>
            Ok(await _service.GetByLinkId(linkId));

        // Only Admin ever posts an evaluation link, so only Admin ever
        // attaches a file to one.
        [HttpPost("upload")]
        [Consumes("multipart/form-data")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Upload([FromForm] int linkId, IFormFile file)
        {
            if (file == null || file.Length == 0)
                return BadRequest(new { message = "No file provided." });

            var allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                { ".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".txt" };
            var ext = Path.GetExtension(file.FileName);
            if (!allowed.Contains(ext))
                return BadRequest(new { message = "File type not allowed." });

            if (file.Length > 10 * 1024 * 1024)
                return BadRequest(new { message = "File too large. Maximum size is 10 MB." });

            var existingCount = (await _service.GetByLinkId(linkId)).Count();
            if (existingCount >= 5)
                return BadRequest(new { message = "Maximum 5 attachments per post." });

            var webRoot = _env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
            var folder  = Path.Combine(webRoot, "uploads", "evaluations");
            Directory.CreateDirectory(folder);

            var fileName = $"{Guid.NewGuid()}{ext}";
            using (var stream = new FileStream(Path.Combine(folder, fileName), FileMode.Create))
                await file.CopyToAsync(stream);

            var imgExts  = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                { ".jpg", ".jpeg", ".png", ".gif", ".webp" };
            var fileType = imgExts.Contains(ext) ? "image" : "document";
            var relPath  = $"/uploads/evaluations/{fileName}";

            var attachment = new EvaluationAttachment
            {
                LinkID     = linkId,
                FileName   = file.FileName,
                FilePath   = relPath,
                FileType   = fileType,
                FileSize   = file.Length,
                UploadedAt = DateTime.Now,
            };

            var ok = await _service.Add(attachment);
            return ok
                ? Ok(new { attachmentID = attachment.AttachmentID, filePath = relPath, fileName = file.FileName, fileType, fileSize = file.Length })
                : StatusCode(500, new { message = "Failed to save attachment." });
        }

        [HttpGet("{id}/download")]
        public async Task<IActionResult> Download(int id)
        {
            var att = await _service.GetById(id);
            if (att == null) return NotFound();

            var webRoot  = _env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
            var fullPath = Path.Combine(webRoot, att.FilePath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));
            if (!System.IO.File.Exists(fullPath)) return NotFound();

            var bytes       = await System.IO.File.ReadAllBytesAsync(fullPath);
            var contentType = Path.GetExtension(att.FileName).ToLower() switch
            {
                ".jpg" or ".jpeg" => "image/jpeg",
                ".png"  => "image/png",
                ".gif"  => "image/gif",
                ".webp" => "image/webp",
                ".pdf"  => "application/pdf",
                ".doc"  => "application/msword",
                ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                ".xls"  => "application/vnd.ms-excel",
                ".xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                ".ppt"  => "application/vnd.ms-powerpoint",
                ".pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                ".txt"  => "text/plain",
                _       => "application/octet-stream",
            };

            return File(bytes, contentType, att.FileName);
        }

        [HttpDelete("{id}")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Delete(int id)
        {
            var att = await _service.GetById(id);
            if (att == null) return NotFound();

            var webRoot  = _env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
            var fullPath = Path.Combine(webRoot, att.FilePath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));
            if (System.IO.File.Exists(fullPath)) System.IO.File.Delete(fullPath);

            var ok = await _service.Delete(id);
            return ok ? Ok(new { message = "Attachment deleted" }) : NotFound();
        }
    }
}
