using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using AstraMentoring_Backend.Services;
using AstraMentoring_Backend.Model;
using System.Linq;

namespace AstraMentoringAPI.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class UsersController : ControllerBase
    {
        private readonly ProfileService _service;
        public UsersController(ProfileService service) { _service = service; }

        // Dumps every user in the system in one call — User Management only,
        // Admin-only. Head's dashboard gets its counts from Users/stats
        // instead and never calls this. Other roles look up individuals via
        // GetById below (a mentee viewing their mentor's name, etc.)
        [HttpGet]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Get()
        {
            var users = (await _service.GetAllUsers()).ToList();
            foreach (var u in users) u.PasswordHash = string.Empty;
            return Ok(users);
        }

        // Open to any authenticated user — every portal legitimately looks up
        // OTHER users this way (mentee -> their mentor, mentor -> their
        // mentees, mentee -> an announcement's admin author), not just "my own
        // profile". The password hash must never leave the server either way,
        // so it's blanked out here regardless of who's asking.
        //
        // Contact info (email, phone, student number, gender) is different —
        // those are only returned to Admin/Head, the caller viewing their own
        // id, or a caller with an actual active mentor<->mentee relationship
        // to the target (the real reason this endpoint stayed wide open:
        // "My Mentor"/"My Mentees" pages showing a real assigned contact's
        // details). Anyone else — a Mentee enumerating unrelated ids, for
        // example — only gets name/role/photo, same as an announcement
        // author lookup already only ever needed.
        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
        {
            var user = await _service.GetUserById(id);
            if (user is null) return NotFound();
            user.PasswordHash = string.Empty;

            var callerId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            var isPrivileged = User.IsInRole("Admin") || User.IsInRole("Head") || callerId == id.ToString();

            // Signature images are only for staff and the owner — never another user.
            if (!isPrivileged) user.SignatureFilePath = null;
            if (!isPrivileged && int.TryParse(callerId, out var callerUserId))
                isPrivileged = await _service.HasActiveMentorMenteeRelationshipAsync(callerUserId, id);

            if (!isPrivileged)
            {
                user.Email = string.Empty;
                user.ContactNumber = null;
                user.StudentNumber = null;
                user.Gender = null;
            }

            return Ok(user);
        }

        // ✅ NEW: Get all active departments
        [HttpGet("departments")]
        public async Task<IActionResult> GetDepartments()
        {
            var result = await _service.GetDepartmentsAsync();
            return Ok(result);
        }

        [HttpGet("assignments")]
        public async Task<IActionResult> GetAssignments()
        {
            var result = await _service.GetAssignmentsAsync();
            return Ok(result);
        }

        [HttpGet("courses")]
        [Authorize]
        public async Task<IActionResult> GetCourses() => Ok(await _service.GetCourseCatalogAsync());

        [HttpGet("stats")]
        public async Task<IActionResult> GetStats(CancellationToken cancellationToken)
        {
            var result = await _service.GetUserStatsAsync(cancellationToken);
            return Ok(result);
        }

        /// <summary>Returns the Admin-only mentee roster used by dashboard engagement drill-downs.</summary>
        [HttpGet("engagement")]
        [Authorize(Roles = "Admin")]
        [ProducesResponseType(typeof(IReadOnlyList<MenteeEngagementResponse>), StatusCodes.Status200OK)]
        public async Task<ActionResult<IReadOnlyList<MenteeEngagementResponse>>> GetMenteeEngagement(
            CancellationToken cancellationToken)
        {
            var result = await _service.GetMenteeEngagementAsync(cancellationToken);
            return Ok(result);
        }

        private bool IsStaff => User.IsInRole("Admin") || User.IsInRole("Head");

        // Both lists are read by every portal; signature paths go to Admin/Head only.
        [HttpGet("mentors-with-dept")]
        public async Task<IActionResult> GetMentorsWithDept()
        {
            var result = (await _service.GetMentorsWithDeptAsync()).ToList();
            if (!IsStaff) result.ForEach(m => m.SignatureFilePath = null);
            return Ok(result);
        }

        [HttpGet("mentees-with-dept")]
        public async Task<IActionResult> GetMenteesWithDept()
        {
            var result = (await _service.GetMenteesWithDeptAsync()).ToList();
            if (!IsStaff) result.ForEach(m => m.SignatureFilePath = null);
            return Ok(result);
        }

        // Write-only — GetAssignments (GET, above) stays open to every role
        // for legitimate self-lookup ("who is my mentor"), but only Admin's
        // User Management page ever calls these two mutating actions
        // (confirmed: no Mentor/Mentee portal file references Users/assign
        // or Users/assignments/{id}), matching the Admin-only pattern
        // already used by Post/SetActive/Delete above.
        [HttpPost("assign")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> AssignMentor([FromBody] AssignRequest request)
        {
            var result = await _service.AssignMentorAsync(request.MenteeUserId, request.MentorUserId);
            return result ? Ok(new { message = "Mentor assigned successfully" }) : BadRequest(new {message="Assignment requires an active mentor and mentee with a valid school and course. Existing assignments were preserved."});
        }

        [HttpDelete("assignments/{assignmentId}")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> RemoveAssignment(int assignmentId)
        {
            var result = await _service.RemoveAssignmentAsync(assignmentId);
            return result ? Ok(new { message = "Assignment removed" }) : NotFound();
        }

        // Unused by the frontend today (account creation goes through
        // Auth/register*), but it's a raw "create a user" endpoint —
        // Admin-only, same as Delete below (Head's portal is read-only
        // oversight and never calls this).
        [HttpPost]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Post([FromBody] User newUser)
        {
            // Ensure the password field is BCrypt-hashed before storing.
            // Accepts either a plain-text password or an already-hashed BCrypt string.
            if (!string.IsNullOrWhiteSpace(newUser.PasswordHash) &&
                !newUser.PasswordHash.StartsWith("$2"))
            {
                var policyError = PasswordPolicy.Validate(newUser.PasswordHash);
                if (policyError != null) return BadRequest(new { message = policyError });
                var auth = HttpContext.RequestServices.GetRequiredService<AuthService>();
                newUser.PasswordHash = auth.HashPassword(newUser.PasswordHash);
            }

            var result = await _service.AddUser(newUser);
            return result ? Ok(new { message = "Created" }) : BadRequest();
        }

        // Used both for self-service profile edits (every portal's own
        // Profile/Account page) and for Admin's User Management page
        // editing anyone. Head has no user-editing UI, so Head is treated
        // as self-service here (otherwise Head could promote itself to Admin
        // or reset an Admin's password).
        [HttpPut("{id}")]
        public async Task<IActionResult> Put(int id, [FromBody] UpdateUserRequest request)
        {
            var callerId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            var isAdmin  = User.IsInRole("Admin");
            var isSelf   = callerId == id.ToString();
            if (!isAdmin && !isSelf)
                return Forbid();

            // The Add/Edit User form and every self-service profile page
            // already enforce this client-side — but that's not a security
            // boundary, only a UI nicety, so a raw PUT with blank names or a
            // malformed email would otherwise sail straight into the row
            // with nothing on the server checking it.
            if (string.IsNullOrWhiteSpace(request.FirstName) || string.IsNullOrWhiteSpace(request.LastName))
                return BadRequest(new { message = "First name and last name are required." });
            if (string.IsNullOrWhiteSpace(request.Email) || !request.Email.Contains('@'))
                return BadRequest(new { message = "A valid email address is required." });

            var auth = HttpContext.RequestServices.GetRequiredService<AuthService>();

            // A self-service caller can edit their own contact info, but Role is
            // not theirs to set — the ownership check above only gates WHO can
            // call this endpoint, not WHICH fields a self-service caller may
            // change, so without this a Mentee could PUT their own id with
            // Role:"Admin" and grant themselves full Admin access on next login.
            // Self-service edits (every portal's Profile page) may only change
            // contact number and password; identity fields and profile
            // placement stay as Admin set them.
            var isSelfServiceOnly = !isAdmin;
            if (isSelfServiceOnly)
            {
                var existingSelf = await _service.GetUserById(id);
                if (existingSelf == null) return NotFound(new { message = "User not found." });
                request.Role          = existingSelf.Role;
                request.FirstName     = existingSelf.FirstName;
                request.LastName      = existingSelf.LastName;
                request.Email         = existingSelf.Email;
                request.StudentNumber = existingSelf.StudentNumber;
                request.Gender        = existingSelf.Gender;
            }

            if (!string.IsNullOrWhiteSpace(request.NewPassword))
            {
                var newPasswordError = PasswordPolicy.Validate(request.NewPassword);
                if (newPasswordError != null) return BadRequest(new { message = newPasswordError });
                if (isSelf)
                {
                    // Self-service change — prove you know the current
                    // password before setting a new one.
                    if (string.IsNullOrWhiteSpace(request.CurrentPassword))
                        return BadRequest(new { message = "Current password is required when changing password." });
                    var existing = await _service.GetUserById(id);
                    if (existing == null) return NotFound(new { message = "User not found." });
                    if (!auth.VerifyPassword(request.CurrentPassword, existing.PasswordHash))
                        return BadRequest(new { message = "Incorrect current password." });
                }
                // else: an Admin/Head resetting someone ELSE's password (the
                // isAdmin check above already gated entry here). The target's
                // current password isn't something an admin can reasonably
                // know — that's the entire point of a reset — so it isn't
                // required. This was previously unconditional, which meant
                // the Password field on the Edit User modal could never
                // actually be used to reset anyone's password.
            }

            var hashedPassword = !string.IsNullOrWhiteSpace(request.NewPassword)
                ? auth.HashPassword(request.NewPassword)
                : "";

            if(isAdmin && request.Role=="Mentee")
            {
                var oldProfile=await _service.GetMenteeProfileAsync(id);
                var course=await _service.ResolveCourseAsync(request.School??oldProfile?.School,request.Course??oldProfile?.Course);
                if(course==null)return BadRequest(new {message=CoursePolicy.Error});
                request.School=course.School;request.Course=course.CourseCode;
                request.YearLevel??=oldProfile?.YearLevel;
                request.Section=oldProfile?.Section;
                request.SectionID=await _service.ResolveSectionIdAsync(course);
                request.DepartmentID??=oldProfile?.DepartmentID;
            }

            var user = new User
            {
                UserID = id,
                FirstName = request.FirstName,
                LastName = request.LastName,
                Email = request.Email,
                PasswordHash = hashedPassword,
                ContactNumber = request.ContactNumber,
                StudentNumber = request.StudentNumber,
                Role = request.Role,
                Gender = request.Gender,
                IsActive = true,
                UpdatedAt = DateTime.Now
            };

            var result = await _service.UpdateUser(id, user);
            if (!result) return NotFound(new { message = "User not found. Please refresh and try again." });

            if (isSelfServiceOnly)
                return Ok(new { message = "User updated successfully" });

            if (request.Role == "Mentor")
            {
                bool hasMentorFields = request.DepartmentID.HasValue
                    || !string.IsNullOrEmpty(request.School)
                    || !string.IsNullOrEmpty(request.Bio)
                    || !string.IsNullOrEmpty(request.Expertise);

                if (hasMentorFields)
                {
                    await _service.UpdateMentorProfileAsync(
                        id,
                        request.DepartmentID,
                        request.School ?? "",
                        request.Bio ?? "",
                        request.Expertise ?? "");
                }
            }
            else if (request.Role == "Mentee")
            {
                bool hasMenteeFields = request.DepartmentID.HasValue
                    || request.SectionID.HasValue
                    || !string.IsNullOrEmpty(request.Course)
                    || !string.IsNullOrEmpty(request.Section)
                    || !string.IsNullOrEmpty(request.School);

                if (hasMenteeFields)
                {
                    await _service.UpdateMenteeProfileAsync(
                        id,
                        request.DepartmentID,
                        request.School ?? "",
                        request.Course ?? "",
                        request.YearLevel ?? "1st Year",
                        request.Section ?? "",
                        request.SectionID);
                }
            }

            return Ok(new { message = "User updated successfully" });
        }

        [HttpPatch("{id}/complete-setup")]
        public async Task<IActionResult> CompleteSetup(int id, [FromBody] CompleteSetupRequest request)
        {
            if (User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value != id.ToString())
                return Forbid();
            var account = await _service.GetUserById(id);
            if (account == null) return NotFound();
            if (account.HasLoggedIn)
                return BadRequest(new { message = "Setup is already complete. Use your profile to change your password." });
            if (!string.IsNullOrWhiteSpace(request.NewPassword))
            {
                var setupPasswordError = PasswordPolicy.Validate(request.NewPassword);
                if (setupPasswordError != null) return BadRequest(new { message = setupPasswordError });
            }
            var result = await _service.CompleteSetupAsync(id, request.NewPassword);
            if (!result) return NotFound(new { message = "User not found." });
            return Ok(new { message = "Setup complete." });
        }

        [HttpPatch("{id}/dropout")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> SetDropOut(int id, [FromBody] DropOutRequest request)
        {
            var result = await _service.SetDropOutAsync(id, request.IsDropOut);
            if (!result) return NotFound(new { message = "Mentee profile not found." });
            var msg = request.IsDropOut ? "Marked as Drop Out" : "Drop Out status removed";
            return Ok(new { message = msg });
        }

        // Admin-only — this is User Management's Activate/Deactivate control for
        // Admin/Head accounts, the reversible alternative to Delete. Blocked
        // from targeting the caller's own account so an Admin can never lock
        // themselves out.
        [HttpPatch("{id}/active")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> SetActive(int id, [FromBody] ActiveRequest request)
        {
            var callerId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (callerId == id.ToString())
                return BadRequest(new { message = "You cannot deactivate your own account." });

            var result = await _service.SetActiveAsync(id, request.IsActive);
            if (!result) return NotFound(new { message = "User not found." });
            var msg = request.IsActive ? "Account reactivated" : "Account deactivated";
            return Ok(new { message = msg });
        }

        // Used by Admin's bulk-delete in User Management — Admin-only. Head's
        // portal has no delete UI and shouldn't be able to hard-delete an
        // account via a direct API call either.
        [HttpDelete("{id}")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Delete(int id)
        {
            var blockReason = await _service.GetHardDeleteBlockReasonAsync(id);
            if (blockReason != null) return BadRequest(new { message = blockReason });

            var result = await _service.DeleteUser(id);
            return result ? Ok(new { message = "Deleted" }) : NotFound();
        }
    }

    public class AssignRequest
    {
        public int MenteeUserId { get; set; }
        public int MentorUserId { get; set; }
    }

    public class CompleteSetupRequest
    {
        public string? NewPassword { get; set; }
    }

    public class DropOutRequest
    {
        public bool IsDropOut { get; set; }
    }

    public class ActiveRequest
    {
        public bool IsActive { get; set; }
    }

    public class UpdateUserRequest
    {
        public string FirstName { get; set; } = string.Empty;
        public string LastName { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string? CurrentPassword { get; set; }
        public string? NewPassword { get; set; }
        public string? ContactNumber { get; set; }
        public string? StudentNumber { get; set; }
        public string Role { get; set; } = string.Empty;

        // ✅ NEW
        public string? School { get; set; }
        public int? DepartmentID { get; set; }

        // Mentor
        public string? Bio { get; set; }
        public string? Expertise { get; set; }

        // Mentee
        public string? Course { get; set; }
        public string? YearLevel { get; set; }
        public string? Section { get; set; }
        public int? SectionID { get; set; }
        public string? Gender { get; set; }
    }
}
