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
    public class EvaluationLinksController : ControllerBase
    {
        private readonly EvaluationService _service;
        private readonly EmailService _emailService;
        public EvaluationLinksController(EvaluationService service, EmailService emailService)
        {
            _service = service;
            _emailService = emailService;
        }

        private int CallerId => int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)!.Value);

        // Same "own posts only" rule as Announcements — with multiple real
        // Admin accounts in this system, one Admin editing/deleting/pinning
        // another Admin's evaluation link was never actually intended, just
        // never checked.
        private async Task<bool> CanModifyAsync(int id)
        {
            var existing = await _service.GetById(id);
            return existing != null && existing.PostedByUserID == CallerId;
        }

        [HttpGet]
        public async Task<IActionResult> Get() => Ok(await _service.GetAll());

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
        {
            var result = await _service.GetById(id);
            return result is null ? NotFound() : Ok(result);
        }

        // Admin-only — every mentee is told to open and fill out whatever
        // gets posted here, so it's a real phishing vector if anyone else
        // can publish one. Head has read-only visibility elsewhere in the
        // app but never posts/edits from here. PostedByUserID always comes
        // from the caller's own JWT, never the request body — otherwise one
        // Admin's link could display (and be managed) as if it were
        // another's.
        [HttpPost]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Post([FromBody] EvaluationLink data)
        {
            data.PostedByUserID = CallerId;
            data.PostedAt  = DateTime.Now;
            data.TargetRole = "Mentee";
            data.IsActive   = true;
            var result = await _service.Add(data);
            if (result) await _emailService.NotifyNewEvaluationLinkAsync(data);
            return result ? Ok(new { message = "Evaluation link created", linkID = data.LinkID }) : BadRequest();
        }

        [HttpPatch("{id}/pin")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> TogglePin(int id)
        {
            if (!await CanModifyAsync(id)) return Forbid();

            var item = await _service.GetById(id);
            if (item == null) return NotFound();
            item.IsPinned = !item.IsPinned;
            var result = await _service.Update(item);
            return result ? Ok(new { isPinned = item.IsPinned }) : BadRequest();
        }

        [HttpPut("{id}")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Put(int id, [FromBody] EvaluationLink data)
        {
            if (!await CanModifyAsync(id)) return Forbid();

            data.LinkID = id;
            // PostedByUserID is never client-editable — keep whatever the
            // row already has, don't let an edit reassign authorship.
            var existing = await _service.GetById(id);
            data.PostedByUserID = existing!.PostedByUserID;
            var result = await _service.Update(data);
            return result ? Ok(new { message = "Evaluation link updated" }) : NotFound();
        }

        [HttpDelete("{id}")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Delete(int id)
        {
            if (!await CanModifyAsync(id)) return Forbid();

            var result = await _service.Delete(id);
            return result ? Ok(new { message = "Evaluation link deleted" }) : NotFound();
        }
    }
}