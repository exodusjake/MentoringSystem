using AstraMentoring_Backend.Repositories;
using AstraMentoring_Backend.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Login protection: each account locks for a minute after 5 wrong passwords
// (LoginAttemptTracker), plus a looser 30-requests-per-minute cap per client
// IP so a whole class on one Wi-Fi can still sign in. Applies to Auth/login only.
builder.Services.AddSingleton<AstraMentoringAPI.LoginAttemptTracker>();
builder.Services.AddSingleton<AstraMentoringAPI.LoginCodeStore>();   // emailed 2nd-step login codes
builder.Services.AddSingleton<AstraMentoringAPI.PasswordResetStore>();   // emailed forgot-password codes
builder.Services.AddRateLimiter(options =>
{
    options.AddPolicy("login", new AstraMentoringAPI.LoginRateLimitPolicy());
    options.OnRejected = (context, _) =>
    {
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        return new ValueTask();
    };
});

// Secure by default: every endpoint requires a valid, authenticated request
// unless it explicitly opts out with [AllowAnonymous] (login, registration,
// and the handful of file-download links that can't carry a Bearer header).
// Previously NO endpoint in this API required authentication at all — the
// JWT machinery below was wired up but never actually enforced anywhere.
builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
});


// JWT Authentication
// The dev-default key below is a known, git-tracked value (appsettings.json)
// — fine for local `dotnet run` against LocalDB, but if it were ever silently
// used in Production it would let anyone forge a valid Admin token with no
// credentials. Failing fast here instead of falling back is what actually
// closes that gap: a missing/still-default Jwt:Key in Production now crashes
// the app at startup (loud, visible, forces the operator to set a real key)
// rather than quietly serving traffic signed with a public secret.
const string devDefaultJwtKey = "AstraMentoringSecretKey2024!SuperSecure";
var jwtKey = builder.Configuration["Jwt:Key"];
if (string.IsNullOrWhiteSpace(jwtKey) || jwtKey == devDefaultJwtKey)
{
    if (!builder.Environment.IsDevelopment())
        throw new InvalidOperationException(
            "Jwt:Key is missing or still set to the dev-default value. " +
            "Set a real, random Jwt:Key in appsettings.Production.json before starting in this environment.");
    jwtKey = devDefaultJwtKey;
}
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };

        // Login (AuthController) already blocks a deactivated account from
        // getting a NEW token — but without this, an account deactivated
        // mid-session keeps working on its EXISTING token for up to 8 hours
        // (the token's lifetime), since nothing else re-checks IsActive.
        // Re-validate against the DB on every authenticated request instead
        // of trusting the token alone, so Deactivate takes effect immediately.
        options.Events = new JwtBearerEvents
        {
            OnTokenValidated = async context =>
            {
                var profileService = context.HttpContext.RequestServices.GetRequiredService<ProfileService>();
                await AstraMentoringAPI.Authentication.AccountAuthenticationEvents.ValidateAsync(context, async userId =>
                {
                    var user = await profileService.GetUserById(userId);
                    return user?.IsActive;
                });
            },
            OnChallenge = AstraMentoringAPI.Authentication.AccountAuthenticationEvents.ChallengeAsync
        };
    });

// CORS – restrict to known frontend origins defined in appsettings.json → Cors:AllowedOrigins
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? Array.Empty<string>();
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
        policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod());
});

// Repositories & Services
builder.Services.AddScoped(typeof(IGenericRepository<>), typeof(GenericRepository<>));
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<ProfileService>();
builder.Services.AddScoped<AnnouncementsService>();
builder.Services.AddScoped<AnnouncementCommentsService>();
builder.Services.AddScoped<AttendanceService>();
builder.Services.AddScoped<AvailabilityService>();
builder.Services.AddScoped<EvaluationService>();
builder.Services.AddScoped<EvaluationSubmissionsService>();
builder.Services.AddScoped<MenteeProfilesService>();
builder.Services.AddScoped<MentorProfilesService>();
builder.Services.AddScoped<NotificationsService>();
builder.Services.AddScoped<ProofOfSessionService>();
builder.Services.AddScoped<SessionRequestsService>();
builder.Services.AddScoped<SessionsService>();
builder.Services.AddScoped<ActivitiesService>();
builder.Services.AddScoped<SettingsService>();
builder.Services.AddScoped<SectionsService>();
builder.Services.AddScoped<MonitorActivitiesService>();
builder.Services.AddScoped<AttendanceLogsService>();
builder.Services.AddScoped<SessionProofsAdminService>();
builder.Services.AddScoped<SessionsAdminService>();
builder.Services.AddScoped<CalendarEventsService>();
builder.Services.AddScoped<MentorScheduleService>();
builder.Services.AddScoped<AvailabilityWorkflowService>();
builder.Services.AddScoped<QRAttendanceService>();
builder.Services.AddScoped<AnnouncementAttachmentsService>();
builder.Services.AddScoped<EvaluationAttachmentsService>();
builder.Services.AddScoped<EvaluationRatingsService>();
builder.Services.AddHttpClient();          // built-in — powers EmailService's Brevo API calls
builder.Services.AddScoped<EmailService>();

// Honor the local reverse proxy only; retain the default trusted loopback proxies.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto);

var app = builder.Build();
app.UseForwardedHeaders();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AllowFrontend");

// Catch-all for unhandled errors: log the details, return a generic JSON message.
app.Use(async (context, next) =>
{
    try
    {
        await next();
    }
    catch (Exception ex) when (!context.RequestAborted.IsCancellationRequested)
    {
        app.Logger.LogError(ex, "Unhandled error on {Method} {Path}", context.Request.Method, context.Request.Path);
        if (context.Response.HasStarted) throw;
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await context.Response.WriteAsJsonAsync(new { message = "Something went wrong on the server. Please try again." });
    }
});

app.UseStaticFiles();
app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.MapControllers();
app.Run();
