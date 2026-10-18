using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Services;

namespace AstraMentoringAPI.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class MenteeProfilesController : ControllerBase
    {
        private readonly MenteeProfilesService _service;
        private readonly ProfileService _profiles;
        public MenteeProfilesController(MenteeProfilesService service, ProfileService profiles) { _service = service; _profiles=profiles; }

        // GET stays open to any signed-in account — Course/Section/School
        // are read broadly across every portal and aren't sensitive.
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
        private void HideOthersSignature(MenteeProfile p)
        {
            if (User.IsInRole("Admin") || User.IsInRole("Head")) return;
            if (User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value != p.UserID.ToString())
                p.SignatureFilePath = null;
        }

        // Unused by any portal's frontend today — a mentee's profile row is
        // created directly by AuthController.RegisterMenteeAsync, not through
        // this route. Restricted to Admin as a safe baseline.
        [HttpPost]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Post([FromBody] MenteeProfile data)
        {
            var course=await _profiles.ResolveCourseAsync(data.School,data.Course);
            if(course==null)return BadRequest(new {message=CoursePolicy.Error});
            data.School=course.School;data.Course=course.CourseCode;
            var result = await _service.Add(data);
            return result ? Ok(new { message = "Mentee profile created" }) : BadRequest();
        }

        [HttpPut("{id}")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Put(int id, [FromBody] MenteeProfile data)
        {
            var existing=await _service.GetById(id);
            if(existing==null)return NotFound();
            var course=await _profiles.ResolveCourseAsync(data.School??existing.School,data.Course??existing.Course);
            if(course==null)return BadRequest(new {message=CoursePolicy.Error});
            data.School=course.School;data.Course=course.CourseCode;
            data.UserID=existing.UserID;data.SectionID=existing.SectionID;data.Section=existing.Section;
            data.SignatureFilePath=existing.SignatureFilePath;data.IsDropOut=existing.IsDropOut;
            data.YearLevel??=existing.YearLevel;data.DepartmentID??=existing.DepartmentID;data.Department??=existing.Department;
            data.MenteeProfileID = id;
            var result = await _service.Update(data);
            return result ? Ok(new { message = "Mentee profile updated" }) : NotFound();
        }

        [HttpDelete("{id}")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Delete(int id)
        {
            var result = await _service.Delete(id);
            return result ? Ok(new { message = "Mentee profile deleted" }) : NotFound();
        }
    }
}