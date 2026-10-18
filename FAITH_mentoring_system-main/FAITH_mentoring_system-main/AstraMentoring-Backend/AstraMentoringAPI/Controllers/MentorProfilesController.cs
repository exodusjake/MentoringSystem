using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Services;

namespace AstraMentoringAPI.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class MentorProfilesController : ControllerBase
    {
        private readonly MentorProfilesService _service;
        public MentorProfilesController(MentorProfilesService service) { _service = service; }

        // GET stays open to any signed-in account — School/Department/Bio/
        // Expertise are read broadly across every portal (mentor cards,
        // dashboards) and aren't sensitive.
        [HttpGet]
        public async Task<IActionResult> Get()
        {
            var all = (await _service.GetAll()).ToList();
            all.ForEach(HideOthersSignature);
            return Ok(all);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
        {
            var result = await _service.GetById(id);
            if (result is null) return NotFound();
            HideOthersSignature(result);
            return Ok(result);
        }

        // Signature images are only for staff and the owner.
        private void HideOthersSignature(MentorProfile p)
        {
            if (User.IsInRole("Admin") || User.IsInRole("Head")) return;
            if (User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value != p.UserID.ToString())
                p.SignatureFilePath = null;
        }

        // Unused by any portal's frontend today — a mentor's profile row is
        // created directly by AuthController.RegisterMentorAsync, not through
        // this route. Restricted to Admin as a safe baseline.
        [HttpPost]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Post([FromBody] MentorProfile data)
        {
            var result = await _service.Add(data);
            return result ? Ok(new { message = "Mentor profile created" }) : BadRequest();
        }

        [HttpPut("{id}")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Put(int id, [FromBody] MentorProfile data)
        {
            data.MentorProfileID = id;
            var result = await _service.Update(data);
            return result ? Ok(new { message = "Mentor profile updated" }) : NotFound();
        }

        [HttpDelete("{id}")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Delete(int id)
        {
            var result = await _service.Delete(id);
            return result ? Ok(new { message = "Mentor profile deleted" }) : NotFound();
        }
    }
}