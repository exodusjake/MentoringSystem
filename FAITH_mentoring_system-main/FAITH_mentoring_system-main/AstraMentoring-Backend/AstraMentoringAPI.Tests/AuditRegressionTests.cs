using System.Net;
using System.Security.Claims;
using System.Threading.RateLimiting;
using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Repositories;
using AstraMentoring_Backend.Services;
using AstraMentoringAPI.Controllers;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;

namespace AstraMentoringAPI.Tests;

// Isolated tests: no production/local database, real accounts, uploads, or email.
public class AuditRegressionTests
{
    [Theory]
    [InlineData("photo.jpg", 20971521, "20 MB")]
    [InlineData("program.exe", 100, "File type not allowed")]
    public async Task ProofEndpointsRejectInvalidFilesBeforeStorage(string name, int size, string message)
    {
        var file=new FormFile(Stream.Null,0,size,"file",name);
        var session=As(new ProofOfSessionController(null!,null!,Sessions(1)),"Mentor");
        var result=Assert.IsType<BadRequestObjectResult>(await session.Upload(10,file));
        Assert.Contains(message,System.Text.Json.JsonSerializer.Serialize(result.Value));
        var evaluation=As(new EvaluationSubmissionsController(null!,null!),"Mentee");
        result=Assert.IsType<BadRequestObjectResult>(await evaluation.Upload(77,file));
        Assert.Contains(message,System.Text.Json.JsonSerializer.Serialize(result.Value));
    }

    private static T As<T>(T controller, string role, int id = 1) where T : ControllerBase
    {
        controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext {
            User = new ClaimsPrincipal(new ClaimsIdentity(new[] {
                new Claim(ClaimTypes.NameIdentifier, id.ToString()), new Claim(ClaimTypes.Role, role)
            }, "test"))
        }};
        return controller;
    }

    private static SessionsService Sessions(int mentorId = 2) => new(
        new Repo<Session>(new Session { SessionID = 10, MentorID = mentorId }),
        new ConfigurationBuilder().Build());

    [Fact]
    public async Task SetupCannotTargetAnotherAccountBeforeDatabaseAccess()
    {
        var controller = As(new UsersController(null!), "Mentee");
        Assert.IsType<ForbidResult>(await controller.CompleteSetup(2, new CompleteSetupRequest { NewPassword = "test" }));
    }

    [Fact]
    public async Task CompletedSetupCannotResetOwnPassword()
    {
        var profile = new ProfileService(new Repo<User>(new User { UserID=1, HasLoggedIn=true }),
            null!, null!, new ConfigurationBuilder().Build());
        var controller = As(new UsersController(profile), "Mentee");
        Assert.IsType<BadRequestObjectResult>(await controller.CompleteSetup(1, new CompleteSetupRequest { NewPassword="test" }));
    }

    [Fact]
    public void DropoutRequiresAdminAndLogsheetExcludesMentee()
    {
        var dropout = typeof(UsersController).GetMethod(nameof(UsersController.SetDropOut))!;
        Assert.Contains(dropout.GetCustomAttributes(typeof(AuthorizeAttribute), true).Cast<AuthorizeAttribute>(), a => a.Roles == "Admin");
        var logsheet = typeof(SessionsAdminController).GetMethod(nameof(SessionsAdminController.GetLogsheet))!;
        Assert.Contains(logsheet.GetCustomAttributes(typeof(AuthorizeAttribute), true).Cast<AuthorizeAttribute>(), a => a.Roles == "Mentor,Admin,Head");
    }

    [Fact]
    public void LegacyRequestWritesCannotReachStorage()
    {
        var controller = new SessionRequestsController(null!);
        Assert.IsType<BadRequestObjectResult>(controller.Post(new SessionRequest()));
        Assert.IsType<BadRequestObjectResult>(controller.Put(1, new SessionRequest()));
        Assert.IsType<BadRequestObjectResult>(controller.Delete(1));
    }

    [Fact]
    public async Task ProofUploadRejectsAnotherMentorsSessionBeforeWritingFile()
    {
        var controller = As(new ProofOfSessionController(null!, null!, Sessions()), "Mentor");
        Assert.IsType<ForbidResult>(await controller.Upload(10, null!));
        Assert.IsType<BadRequestObjectResult>(controller.Post(new ProofOfSession()));
        Assert.IsType<BadRequestObjectResult>(controller.Put(1, new ProofOfSession()));
    }

    [Fact]
    public async Task ProofDeleteUsesStoredSessionOwner()
    {
        var repo = new Repo<ProofOfSession>(new ProofOfSession { ProofID=3, SessionID=10 });
        var controller = As(new ProofOfSessionController(new ProofOfSessionService(repo), null!, Sessions()), "Mentor");
        Assert.IsType<ForbidResult>(await controller.Delete(3));
        Assert.False(repo.Deleted);
        controller = As(new ProofOfSessionController(new ProofOfSessionService(repo), null!, Sessions(1)), "Mentor");
        Assert.IsType<OkObjectResult>(await controller.Delete(3));
        Assert.True(repo.Deleted);
    }

    [Fact]
    public async Task OtherMentorCannotReadRosterOrMakeupRequesters()
    {
        var controller = As(new SessionsAdminController(null!, null!, Sessions()), "Mentor");
        Assert.IsType<ForbidResult>(await controller.GetSessionMentees(10));
        Assert.IsType<ForbidResult>(await controller.GetMakeupRequester(10));
    }

    [Fact]
    public void LoginBudgetsAreIndependentPerClient()
    {
        var policy = new AstraMentoringAPI.LoginRateLimitPolicy();
        using var limiter = PartitionedRateLimiter.Create<HttpContext, string>(policy.GetPartition);
        var first = new DefaultHttpContext(); first.Connection.RemoteIpAddress = IPAddress.Parse("192.0.2.1");
        var second = new DefaultHttpContext(); second.Connection.RemoteIpAddress = IPAddress.Parse("192.0.2.2");
        for (int i=0; i<30; i++) { using var lease=limiter.AttemptAcquire(first); Assert.True(lease.IsAcquired); }
        using var blocked=limiter.AttemptAcquire(first); Assert.False(blocked.IsAcquired);
        using var allowed=limiter.AttemptAcquire(second); Assert.True(allowed.IsAcquired);
    }

    [Theory]
    [InlineData(125.0, 100.0)]
    [InlineData(-10.0, 0.0)]
    [InlineData(73.4, 73.4)]
    public void AttendancePercentIsClampedToRealisticRange(double raw, double expected)
    {
        Assert.Equal(expected, MonitorActivitiesService.ClampPercent(raw), 1);
    }

    private sealed class Repo<T>(T value) : IGenericRepository<T> where T : class
    {
        public bool Deleted { get; private set; }
        public Task<T?> GetByIdAsync(int id) => Task.FromResult<T?>(value);
        public Task<IEnumerable<T>> GetAllAsync() => Task.FromResult<IEnumerable<T>>(new[] {value});
        public Task<bool> DeleteAsync(int id) { Deleted=true; return Task.FromResult(true); }
        public Task<bool> AddAsync(T entity) => throw new NotSupportedException();
        public Task<bool> UpdateAsync(T entity) => throw new NotSupportedException();
        public IQueryable<T> GetAll() => throw new NotSupportedException();
        public Task Create(T entity) => throw new NotSupportedException();
    }
}
