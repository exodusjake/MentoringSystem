using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using AstraMentoring_Backend.Model;

namespace AstraMentoring_Backend.Services
{
    // Sends transactional emails via Brevo's REST API for three events:
    // new Announcement, new EvaluationLink, and a Session log being
    // finalized (LogStatus -> "Submitted"). See Program.cs (AddHttpClient +
    // AddScoped<EmailService>) for wiring, and appsettings.json/User Secrets
    // for the "Brevo:*" / "Frontend:BaseUrl" configuration this reads.
    //
    // Deliberately never throws out of a public method — a down/misconfigured
    // email provider must never fail the caller's real operation (the
    // announcement/evaluation link/session log is already saved by the time
    // any of these run). Failures are logged only.
    //
    // Every send is one recipient at a time (never a shared "to" list) —
    // Brevo's "to" array puts every address on the same email's To header,
    // which would let recipients see each other's email addresses.
    public class EmailService
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ILogger<EmailService> _logger;
        private readonly string _connectionString;
        private readonly string _apiKey;
        private readonly string _senderEmail;
        private readonly string _brandName;
        private readonly string _frontendBaseUrl;
        private readonly bool _isDevelopment;
        private readonly string _smtpHost;
        private readonly int _smtpPort;
        private readonly string _smtpUser;
        private readonly string _smtpPassword;
        private readonly string _smtpFrom;
        private readonly string _contactTo;

        public EmailService(IHttpClientFactory httpClientFactory, IConfiguration config, ILogger<EmailService> logger)
        {
            _httpClientFactory = httpClientFactory;
            _logger = logger;
            _connectionString = config.GetConnectionString("DefaultConnection")
                ?? "Server=(localdb)\\MSSQLLocalDB;Database=AstraMentoring;Trusted_Connection=True;MultipleActiveResultSets=True";
            _apiKey          = config["Brevo:ApiKey"]      ?? string.Empty;
            _senderEmail     = config["Brevo:SenderEmail"] ?? string.Empty;
            _brandName       = config["Brevo:SenderName"]  ?? "AstraMentoring";
            _frontendBaseUrl = (config["Frontend:BaseUrl"] ?? "http://localhost:5501").TrimEnd('/');
            _isDevelopment   = string.Equals(config["ASPNETCORE_ENVIRONMENT"], "Development", StringComparison.OrdinalIgnoreCase);
            _smtpHost        = config["Smtp:Host"] ?? "smtp.gmail.com";
            _smtpPort        = int.TryParse(config["Smtp:Port"], out var sp) ? sp : 587;
            _smtpUser        = config["Smtp:User"] ?? string.Empty;
            _smtpPassword    = (config["Smtp:Password"] ?? string.Empty).Replace(" ", "");
            _smtpFrom        = config["Smtp:From"] ?? _smtpUser;
            _contactTo       = config["Contact:To"] ?? string.Empty;
        }


        // ── SMTP (preferred when Smtp:User/Smtp:Password are set) ──────────
        // Sending through the sender's own mail server (e.g. Gmail with an
        // app password) passes SPF/DKIM/DMARC for that address, which is
        // what keeps these emails out of spam.
        private bool SmtpConfigured =>
            !string.IsNullOrWhiteSpace(_smtpUser) && !string.IsNullOrWhiteSpace(_smtpPassword);

        private async Task<bool> SendViaSmtpAsync(string recipientEmail, string senderName, string subject, string htmlBody)
        {
            try
            {
                var message = new MimeKit.MimeMessage();
                message.From.Add(new MimeKit.MailboxAddress(senderName, _smtpFrom));
                message.To.Add(MimeKit.MailboxAddress.Parse(recipientEmail));
                message.Subject = subject;
                message.Body = new MimeKit.BodyBuilder { HtmlBody = htmlBody }.ToMessageBody();

                using var client = new MailKit.Net.Smtp.SmtpClient { Timeout = 20000 };
                await client.ConnectAsync(_smtpHost, _smtpPort,
                    _smtpPort == 465 ? MailKit.Security.SecureSocketOptions.SslOnConnect
                                     : MailKit.Security.SecureSocketOptions.StartTls);
                await client.AuthenticateAsync(_smtpUser, _smtpPassword);
                await client.SendAsync(message);
                await client.DisconnectAsync(true);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "EmailService: SMTP send failed for subject '{Subject}'.", subject);
                return false;
            }
        }
        // ── Core send — one recipient, never throws ────────────────────────
        private async Task<bool> SendEmailAsync(string recipientEmail, string senderName, string subject, string htmlBody)
        {
            if (string.IsNullOrWhiteSpace(recipientEmail)) return false;

            if (SmtpConfigured) return await SendViaSmtpAsync(recipientEmail, senderName, subject, htmlBody);

            if (string.IsNullOrWhiteSpace(_apiKey) || string.IsNullOrWhiteSpace(_senderEmail))
            {
                _logger.LogWarning("EmailService: Brevo:ApiKey or Brevo:SenderEmail is not configured — skipping send.");
                return false;
            }

            try
            {
                var payload = new
                {
                    sender = new { name = senderName, email = _senderEmail },
                    to = new[] { new { email = recipientEmail } },
                    subject,
                    htmlContent = htmlBody
                };

                var client = _httpClientFactory.CreateClient();
                var request = new HttpRequestMessage(HttpMethod.Post, "https://api.brevo.com/v3/smtp/email")
                {
                    Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
                };
                request.Headers.Add("api-key", _apiKey);
                request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

                var response = await client.SendAsync(request);
                if (!response.IsSuccessStatusCode)
                {
                    var body = await response.Content.ReadAsStringAsync();
                    _logger.LogWarning("EmailService: Brevo send failed ({Status}) for subject '{Subject}': {Body}",
                        response.StatusCode, subject, body);
                    return false;
                }
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "EmailService: exception while sending email with subject '{Subject}'.", subject);
                return false;
            }
        }

        // A person's own name for a personal touch ("Juan Dela Cruz via
        // AstraMentoring") when the content genuinely comes from one
        // individual — a Mentor or Mentee's own action (posting an
        // announcement, logging a session, posting/booking a slot); the
        // institutional name alone for anything office-wide (Admin/Head
        // announcements, evaluation links, calendar publishing).
        private string SenderNameFor(string? actorRole, string? actorFullName) =>
            (actorRole == "Mentor" || actorRole == "Mentee") && !string.IsNullOrWhiteSpace(actorFullName)
                ? $"{actorFullName} via {_brandName}"
                : _brandName;

        // Shared, professional-looking HTML shell — header band with the
        // brand name, a body slot, an optional CTA button, and a footer
        // note. Kept deliberately simple (inline styles only, single accent
        // color) since most email clients strip <style> blocks.
        // User-entered text going into an email's HTML body.
        private static string Enc(string? text) => WebUtility.HtmlEncode(text ?? string.Empty);

        // heading is plain text; bodyHtml must already have its user text encoded.
        private static string BuildEmailHtml(string heading, string bodyHtml, string? ctaText = null, string? ctaUrl = null)
        {
            heading = Enc(heading);
            var ctaHtml = !string.IsNullOrWhiteSpace(ctaUrl)
                ? $@"<a href=""{ctaUrl}"" style=""display:inline-block;margin-top:22px;background:#2563eb;color:#ffffff;
                       text-decoration:none;padding:11px 24px;border-radius:6px;font-weight:600;font-size:14px;
                       font-family:Arial,Helvetica,sans-serif;"">{ctaText}</a>"
                : string.Empty;

            return $@"
                <div style=""font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;background:#f3f4f6;padding:24px 12px;"">
                  <div style=""background:#2563eb;padding:18px 28px;border-radius:10px 10px 0 0;"">
                    <span style=""color:#ffffff;font-size:17px;font-weight:700;letter-spacing:.01em;"">AstraMentoring</span>
                  </div>
                  <div style=""background:#ffffff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;padding:28px;"">
                    <h2 style=""margin:0 0 12px;font-size:18px;color:#111827;font-family:Arial,Helvetica,sans-serif;"">{heading}</h2>
                    <div style=""font-size:14px;line-height:1.6;color:#374151;font-family:Arial,Helvetica,sans-serif;"">{bodyHtml}</div>
                    {ctaHtml}
                    <p style=""margin-top:28px;padding-top:16px;border-top:1px solid #f0f1f3;font-size:11px;color:#9ca3af;
                       font-family:Arial,Helvetica,sans-serif;"">This is an automated message from AstraMentoring. Please do not reply to this email.</p>
                  </div>
                </div>";
        }

        // Rich-text announcement content arrives as HTML from the poster's
        // editor — strip tags for a short plain-text excerpt in the email.
        private static string PlainTextExcerpt(string html, int maxLength = 200)
        {
            if (string.IsNullOrWhiteSpace(html)) return string.Empty;
            var text = Regex.Replace(html, "<[^>]+>", " ");
            text = WebUtility.HtmlDecode(text);
            text = Regex.Replace(text, @"\s+", " ").Trim();
            return text.Length > maxLength ? text[..maxLength] + "…" : text;
        }

        // ── Login verification code ──────────────────────────────────────
        // Returns false when the email could not be delivered so the caller
        // can tell the user instead of leaving them waiting for a code that
        // will never arrive.
        public async Task<bool> SendLoginCodeAsync(string recipientEmail, string? firstName, string code, int validMinutes)
        {
            if (!SmtpConfigured && (string.IsNullOrWhiteSpace(_apiKey) || string.IsNullOrWhiteSpace(_senderEmail)) && _isDevelopment)
            {
                // Local dev without a Brevo key: surface the code in the console so login still works.
                _logger.LogWarning("EmailService (Development): login code for {Email} is {Code}", recipientEmail, code);
                return true;
            }

            var html = BuildCodeEmailHtml(firstName, code, validMinutes, "Verify your email",
                "Use the code below to finish signing in to AstraMentoring.",
                "You only need to do this once.",
                "If you didn’t try to sign in, you can safely ignore this email. If you keep getting these, please tell the Guidance Office so your password can be changed.",
                "a sign-in was started with this address on AstraMentoring");
            return await SendEmailAsync(recipientEmail, _brandName, "Your AstraMentoring sign-in code", html);
        }

        // Forgot-password: emails a one-time code the user enters on the login page.
        public async Task<bool> SendPasswordResetCodeAsync(string recipientEmail, string? firstName, string code, int validMinutes)
        {
            if (!SmtpConfigured && (string.IsNullOrWhiteSpace(_apiKey) || string.IsNullOrWhiteSpace(_senderEmail)) && _isDevelopment)
            {
                _logger.LogWarning("EmailService (Development): password reset code for {Email} is {Code}", recipientEmail, code);
                return true;
            }

            var html = BuildCodeEmailHtml(firstName, code, validMinutes, "Reset your password",
                "We received a request to reset the password for your AstraMentoring account. Enter the code below on the login page to choose a new password.",
                "Never share this code with anyone.",
                "If you didn’t ask to reset your password, you can safely ignore this email — your password will stay the same.",
                "a password reset was requested for this address on AstraMentoring");
            return await SendEmailAsync(recipientEmail, _brandName, "Reset your AstraMentoring password", html);
        }

        // Signed-in "change my password": code the user types on the Account page.
        public async Task<bool> SendPasswordChangeCodeAsync(string recipientEmail, string? firstName, string code, int validMinutes)
        {
            if (!SmtpConfigured && (string.IsNullOrWhiteSpace(_apiKey) || string.IsNullOrWhiteSpace(_senderEmail)) && _isDevelopment)
            {
                _logger.LogWarning("EmailService (Development): password change code for {Email} is {Code}", recipientEmail, code);
                return true;
            }

            var html = BuildCodeEmailHtml(firstName, code, validMinutes, "Confirm your password change",
                "Enter the code below on the Account page to confirm that you want to change your AstraMentoring password.",
                "Never share this code with anyone.",
                "If you didn’t ask to change your password, ignore this email and consider telling the Guidance Office — someone may know your current password.",
                "a password change was requested from your AstraMentoring account");
            return await SendEmailAsync(recipientEmail, _brandName, "Confirm your AstraMentoring password change", html);
        }

        // Admin "change the System Settings password": code typed on the Settings page.
        public async Task<bool> SendSettingsPasswordCodeAsync(string recipientEmail, string? firstName, string code, int validMinutes)
        {
            if (!SmtpConfigured && (string.IsNullOrWhiteSpace(_apiKey) || string.IsNullOrWhiteSpace(_senderEmail)) && _isDevelopment)
            {
                _logger.LogWarning("EmailService (Development): settings password code for {Email} is {Code}", recipientEmail, code);
                return true;
            }

            var html = BuildCodeEmailHtml(firstName, code, validMinutes, "Confirm settings password change",
                "Enter the code below on the System Settings page to confirm that you want to change the Settings password.",
                "Never share this code with anyone.",
                "If you didn’t ask to change the Settings password, ignore this email and let the Guidance Office know.",
                "a Settings password change was requested from your AstraMentoring admin account");
            return await SendEmailAsync(recipientEmail, _brandName, "Confirm your AstraMentoring Settings password change", html);
        }

        // Branded layout for the emailed codes: navy header with the logo, white
        // card with the code, a help box, and a footer with site links. Table
        // based with inline styles so it renders in Gmail/Outlook/mobile clients.
        // Colours follow the app: navy #0b1a5c, blue #2563eb, gold #f0b429.
        private string BuildCodeEmailHtml(string? firstName, string code, int validMinutes, string title, string intro, string expiryNote, string ignoreNote, string reason)
        {
            var baseUrl = _frontendBaseUrl;
            var logoUrl = baseUrl + "/IMAGES/LOGO-mark.png";
            const string font = "font-family:Arial,Helvetica,sans-serif;";

            var digits = new StringBuilder();
            foreach (var ch in code)
                digits.Append($@"<td style=""width:44px;height:54px;background:#eef3ff;border:1px solid #c7d6fb;border-radius:8px;text-align:center;font-size:26px;font-weight:700;color:#0b1a5c;{font}"">{Enc(ch.ToString())}</td><td style=""width:8px;""></td>");

            return $@"
<div style=""background:#f1f5f9;padding:24px 12px;{font}"">
  <table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""max-width:560px;margin:0 auto;"">
    <tr>
      <td style=""background:#0b1a5c;border-radius:12px 12px 0 0;padding:14px 22px;"">
        <table role=""presentation"" cellpadding=""0"" cellspacing=""0"" style=""margin:0 auto;""><tr>
          <td style=""padding-right:12px;vertical-align:middle;""><img src=""{logoUrl}"" alt=""Astra Mentoring"" width=""38"" style=""display:block;border:0;height:auto;max-width:38px;background:#ffffff;border-radius:50%;padding:3px;"" /></td>
          <td style=""vertical-align:middle;text-align:left;"">
            <div style=""color:#ffffff;font-size:14px;font-weight:700;letter-spacing:.05em;{font}"">ASTRA MENTORING</div>
            <div style=""color:#b6c4f2;font-size:11px;margin-top:1px;{font}"">FAITH Colleges</div>
          </td>
        </tr></table>
      </td>
    </tr>
    <tr><td style=""background:#f0b429;height:4px;line-height:4px;font-size:0;"">&nbsp;</td></tr>
    <tr>
      <td style=""background:#ffffff;padding:34px 32px 30px;"">
        <h1 style=""margin:0 0 14px;text-align:center;font-size:26px;color:#0b1a5c;{font}"">{Enc(title)}</h1>
        <p style=""margin:0 0 6px;font-size:15px;line-height:1.6;color:#475569;{font}"">Hi {Enc(firstName)},</p>
        <p style=""margin:0 0 22px;font-size:15px;line-height:1.6;color:#475569;{font}"">{Enc(intro)}</p>

        <table role=""presentation"" cellpadding=""0"" cellspacing=""0"" style=""margin:0 auto 14px;""><tr>{digits}</tr></table>

        <p style=""margin:0 0 22px;text-align:center;font-size:13px;color:#64748b;{font}"">This code expires in <strong style=""color:#0b1a5c;"">{validMinutes} minutes</strong>. {Enc(expiryNote)}</p>

        <p style=""margin:0;font-size:14px;line-height:1.6;color:#475569;{font}"">{Enc(ignoreNote)}</p>
      </td>
    </tr>
    <tr><td style=""height:14px;line-height:14px;font-size:0;"">&nbsp;</td></tr>
    <tr>
      <td style=""background:#0b1a5c;border-radius:12px;padding:22px 24px;text-align:center;font-size:12px;line-height:1.7;color:#b6c4f2;{font}"">
        <a href=""{baseUrl}/LANDING/HTML/landing.html"" style=""color:#ffffff;font-weight:700;text-decoration:none;"">Home</a> &nbsp;<span style=""color:#f0b429;"">•</span>&nbsp;
        <a href=""{baseUrl}/LANDING/HTML/terms.html"" style=""color:#ffffff;font-weight:700;text-decoration:none;"">Terms</a> &nbsp;<span style=""color:#f0b429;"">•</span>&nbsp;
        <a href=""{baseUrl}/LANDING/HTML/privacy.html"" style=""color:#ffffff;font-weight:700;text-decoration:none;"">Privacy</a> &nbsp;<span style=""color:#f0b429;"">•</span>&nbsp;
        <a href=""{baseUrl}/LANDING/HTML/landing.html#faq"" style=""color:#ffffff;font-weight:700;text-decoration:none;"">Help</a>
        <div style=""height:2px;width:40px;background:#f0b429;margin:14px auto;line-height:2px;font-size:0;"">&nbsp;</div>
        <p style=""margin:0;"">You received this email because {Enc(reason)}.</p>
        <p style=""margin:6px 0 0;"">This is an automated message — please don’t reply.</p>
        <p style=""margin:12px 0 0;color:#ffffff;font-weight:700;"">AstraMentoring · FAITH Colleges</p>
      </td>
    </tr>
  </table>
</div>";
        }

        // Contact-us form on the login page: forwards the visitor's message to
        // the Guidance Office inbox (Contact:To, else the sending address).
        public async Task<bool> SendContactInquiryAsync(string name, string senderEmail, string topic, string message)
        {
            var to = FirstNonEmpty(_contactTo, _smtpUser, _senderEmail);
            if (string.IsNullOrWhiteSpace(to))
            {
                _logger.LogWarning("EmailService: no Contact:To / sender address configured — contact inquiry dropped.");
                return false;
            }

            var body = $@"
                <p><strong>From:</strong> {Enc(name)} (<a href=""mailto:{Enc(senderEmail)}"">{Enc(senderEmail)}</a>)</p>
                <p><strong>Topic:</strong> {Enc(topic)}</p>
                <p style=""white-space:pre-wrap;border-left:3px solid #e5e7eb;padding-left:12px;"">{Enc(message)}</p>
                <p style=""color:#6b7280;font-size:12px;"">Sent from the AstraMentoring login page. Reply directly to the sender's email address above.</p>";
            var html = BuildEmailHtml("New inquiry", body);
            return await SendEmailAsync(to, _brandName, $"[Inquiry] {topic} — {name}", html);
        }

        private static string FirstNonEmpty(params string[] values)
            => values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v)) ?? string.Empty;

        // ── Announcement ─────────────────────────────────────────────────
        public async Task NotifyNewAnnouncementAsync(Announcement data)
        {
            // "Admin only" announcements are not emailed to mentors or mentees.
            if (string.Equals(data.TargetAudience, "Admin", StringComparison.OrdinalIgnoreCase)) return;

            using var conn = new SqlConnection(_connectionString);

            var poster = await conn.QueryFirstOrDefaultAsync<(string FirstName, string LastName, string Role)>(
                "SELECT FirstName, LastName, Role FROM Users WHERE UserID = @Id",
                new { Id = data.PostedByUserID });

            List<(string Email, string Role)> recipients;
            if (data.TargetAudience == "Mentee" && poster.Role == "Mentor")
            {
                recipients = (await conn.QueryAsync<(string Email, string Role)>(
                    @"SELECT u.Email, u.Role FROM MentorMentee mm
                      JOIN Users u ON u.UserID = mm.MenteeID
                      WHERE mm.MentorID = @MentorID AND mm.IsActive = 1 AND u.IsActive = 1",
                    new { MentorID = data.PostedByUserID })).ToList();
            }
            else if (data.TargetAudience == "Mentee")
            {
                recipients = (await conn.QueryAsync<(string Email, string Role)>(
                    "SELECT Email, Role FROM Users WHERE Role = 'Mentee' AND IsActive = 1")).ToList();
            }
            else if (data.TargetAudience == "Mentor")
            {
                recipients = (await conn.QueryAsync<(string Email, string Role)>(
                    "SELECT Email, Role FROM Users WHERE Role = 'Mentor' AND IsActive = 1")).ToList();
            }
            else // "Both" or anything else unrecognized falls back to the widest audience
            {
                recipients = (await conn.QueryAsync<(string Email, string Role)>(
                    "SELECT Email, Role FROM Users WHERE Role IN ('Mentor','Mentee') AND IsActive = 1")).ToList();
            }

            var posterName  = poster.FirstName != null ? $"{poster.FirstName} {poster.LastName}".Trim() : "Someone";
            var senderName  = SenderNameFor(poster.Role, posterName);
            var subject     = $"New Announcement: {data.Title}";
            var excerpt     = PlainTextExcerpt(data.Content);

            foreach (var (email, role) in recipients)
            {
                // Each role reads announcements on its own portal page.
                var portalPath = role == "Mentor" ? "MENTOR" : "MENTEE";
                var ctaUrl     = $"{_frontendBaseUrl}/{portalPath}/HTML/announcements.html?id={data.AnnouncementID}";

                var body = $@"
                    <p><strong>{Enc(posterName)}</strong> posted a new announcement.</p>
                    <p>{Enc(excerpt)}</p>";

                var html = BuildEmailHtml(data.Title, body, "View Announcement", ctaUrl);
                await SendEmailAsync(email, senderName, subject, html);
            }
        }

        // ── Evaluation Link ──────────────────────────────────────────────
        public async Task NotifyNewEvaluationLinkAsync(EvaluationLink data)
        {
            using var conn = new SqlConnection(_connectionString);

            var recipients = (await conn.QueryAsync<string>(
                "SELECT Email FROM Users WHERE Role = 'Mentee' AND IsActive = 1")).ToList();

            var deadlineLine = data.Deadline.HasValue
                ? $"<p><strong>Deadline:</strong> {data.Deadline.Value:MMMM d, yyyy}</p>"
                : string.Empty;

            var subject = $"New Evaluation Form: {data.Title}";
            var body = $@"
                <p>A new evaluation form has been posted.</p>
                <p>{data.Description}</p>
                {deadlineLine}";
            var html = BuildEmailHtml(data.Title, body, "Open Evaluation", $"{_frontendBaseUrl}/MENTEE/HTML/announcements.html?id=eval-{data.LinkID}");

            foreach (var email in recipients)
                await SendEmailAsync(email, _brandName, subject, html);
        }

        // ── Session logged (LogStatus -> "Submitted") ───────────────────
        // Sent only to mentees on the Attendance roster of this specific
        // session (present or absent) — not every mentee assigned to the
        // mentor — since the email body reports that mentee's own
        // attendance status for this session.
        public async Task NotifySessionLoggedAsync(int sessionId)
        {
            using var conn = new SqlConnection(_connectionString);

            var session = await conn.QueryFirstOrDefaultAsync<(DateTime SessionDate, string MentorFirstName, string MentorLastName, string? SlotName)>(
                @"SELECT s.SessionDate, u.FirstName AS MentorFirstName, u.LastName AS MentorLastName, s.SlotName
                  FROM Sessions s
                  JOIN Users u ON u.UserID = s.MentorID
                  WHERE s.SessionID = @SessionID",
                new { SessionID = sessionId });

            if (session.MentorFirstName == null) return; // session/mentor not found — nothing to notify

            var attendees = await conn.QueryAsync<(string Email, bool IsPresent)>(
                @"SELECT u.Email, a.IsPresent
                  FROM Attendance a
                  JOIN Users u ON u.UserID = a.MenteeID
                  WHERE a.SessionID = @SessionID AND u.IsActive = 1",
                new { SessionID = sessionId });

            var mentorName = $"{session.MentorFirstName} {session.MentorLastName}".Trim();
            var senderName = SenderNameFor("Mentor", mentorName);
            var dateStr    = session.SessionDate.ToString("MMMM d, yyyy");
            var ctaUrl     = $"{_frontendBaseUrl}/MENTEE/HTML/sessions.html?id={sessionId}";
            // Null for a makeup session or one logged before slots existed —
            // falls back to the date-only phrasing that was already here.
            var slotLine   = !string.IsNullOrWhiteSpace(session.SlotName) ? $" ({session.SlotName})" : "";

            foreach (var attendee in attendees)
            {
                if (string.IsNullOrWhiteSpace(attendee.Email)) continue;

                var statusLabel = attendee.IsPresent ? "Present" : "Absent";
                var subject = $"Session Logged — {dateStr}{slotLine}";
                var body = $@"
                    <p>Your mentoring session with <strong>{Enc(mentorName)}</strong> on <strong>{dateStr}</strong>{Enc(slotLine)} has been logged.</p>
                    <p>Your recorded attendance status: <strong>{statusLabel}</strong></p>";
                var html = BuildEmailHtml("Session Logged", body, "View Session", ctaUrl);

                await SendEmailAsync(attendee.Email, senderName, subject, html);
            }
        }

        private static string FormatAvailabilityStart(DateTime date, TimeSpan start) =>
            $"{date:MMMM d, yyyy}, {DateTime.Today.Add(start):h:mm tt}";

        // ── Calendar published (Admin's "Publish to Mentors" action) ────
        // Fires once per event that newly transitions Unpublished -> Published
        // (see CalendarEventsController.Put) — not on every edit of an
        // already-published event, and not on the initial draft creation.
        public async Task NotifyCalendarUpdatedAsync(CalendarEvent data)
        {
            using var conn = new SqlConnection(_connectionString);

            var recipients = (await conn.QueryAsync<string>(
                "SELECT Email FROM Users WHERE Role = 'Mentor' AND IsActive = 1")).ToList();

            var dateLine = data.StartDate.Date == data.EndDate.Date
                ? data.StartDate.ToString("MMMM d, yyyy")
                : $"{data.StartDate:MMMM d, yyyy} – {data.EndDate:MMMM d, yyyy}";

            var subject = "Academic Calendar Updated";
            var body = $@"
                <p>A new item has been published to the academic calendar:</p>
                <p><strong>{Enc(data.Title)}</strong> ({Enc(data.EventType)})</p>
                <p>{dateLine}</p>";
            var html = BuildEmailHtml("Calendar Updated", body, "View Calendar", $"{_frontendBaseUrl}/MENTOR/HTML/calendar.html");

            foreach (var email in recipients)
                await SendEmailAsync(email, _brandName, subject, html);
        }

        // ── Mentor posts a new availability slot ────────────────────────
        // Notifies that mentor's own active mentees only — a slot only
        // matters to the mentees who could actually book it.
        public async Task NotifyNewAvailabilitySlotAsync(int mentorId, DateTime availableDate, TimeSpan startTime)
        {
            using var conn = new SqlConnection(_connectionString);

            var mentor = await conn.QueryFirstOrDefaultAsync<(string FirstName, string LastName)>(
                "SELECT FirstName, LastName FROM Users WHERE UserID = @Id", new { Id = mentorId });
            if (mentor.FirstName == null) return;

            var recipients = (await conn.QueryAsync<string>(
                @"SELECT u.Email FROM MentorMentee mm
                  JOIN Users u ON u.UserID = mm.MenteeID
                  WHERE mm.MentorID = @MentorID AND mm.IsActive = 1 AND u.IsActive = 1",
                new { MentorID = mentorId })).ToList();

            var mentorName = $"{mentor.FirstName} {mentor.LastName}".Trim();
            var senderName = SenderNameFor("Mentor", mentorName);
            var subject    = "New Available Session Slot";
            var body = $@"
                <p><strong>{Enc(mentorName)}</strong> posted a new available session slot:</p>
                <p>{FormatAvailabilityStart(availableDate, startTime)}</p>";
            var html = BuildEmailHtml("New Available Slot", body, "Book This Slot", $"{_frontendBaseUrl}/MENTEE/HTML/schedule-session.html");

            foreach (var email in recipients)
                await SendEmailAsync(email, senderName, subject, html);
        }

        // ── Mentee books a posted slot (auto-confirmed session) ─────────
        // Notifies only that slot's own mentor — a single recipient.
        public async Task NotifySlotBookedAsync(int menteeId, int availabilityId, string? purpose)
        {
            using var conn = new SqlConnection(_connectionString);

            var slot = await conn.QueryFirstOrDefaultAsync<(string MentorEmail, DateTime AvailableDate, TimeSpan StartTime, TimeSpan? EndTime)>(
                @"SELECT u.Email AS MentorEmail, a.AvailableDate, a.StartTime, a.EndTime
                  FROM Availability a
                  JOIN Users u ON u.UserID = a.MentorID
                  WHERE a.AvailabilityID = @Id",
                new { Id = availabilityId });
            if (slot.MentorEmail == null) return;

            var mentee = await conn.QueryFirstOrDefaultAsync<(string FirstName, string LastName)>(
                "SELECT FirstName, LastName FROM Users WHERE UserID = @Id", new { Id = menteeId });

            var menteeName  = mentee.FirstName != null ? $"{mentee.FirstName} {mentee.LastName}".Trim() : "A mentee";
            var senderName  = SenderNameFor("Mentee", menteeName);
            var purposeLine = !string.IsNullOrWhiteSpace(purpose) ? $"<p><strong>Purpose:</strong> {Enc(purpose)}</p>" : string.Empty;

            var subject = "Your Slot Has Been Booked";
            var body = $@"
                <p><strong>{Enc(menteeName)}</strong> booked your available slot:</p>
                <p>{FormatAvailabilityStart(slot.AvailableDate, slot.StartTime)}</p>
                {purposeLine}";
            var html = BuildEmailHtml("Slot Booked", body, "View Availability", $"{_frontendBaseUrl}/MENTOR/HTML/availability.html");

            await SendEmailAsync(slot.MentorEmail, senderName, subject, html);
        }

        // ── Mentor schedules a regular (non-makeup) session ──────────────
        // A make-up session (RequestID set) comes from the mentee's own
        // booking — they already know, so only NotifySlotBookedAsync (the
        // mentor) applies there. A regular session is scheduled unilaterally
        // by the mentor for a whole section, so the mentees genuinely have
        // no other way to know until they revisit the portal.
        //
        // Recipient filtering mirrors MENTEE/JS/sessions.js's own
        // isSessionForMySection(): no [SECTION] prefix -> every one of the
        // mentor's mentees; a prefix (comma-separated sections allowed) ->
        // only mentees whose own section is in that list.
        //
        // The section a mentee is matched against must be the SAME composed
        // value the rest of the app uses — vw_MenteeDetails.SectionCode
        // (COALESCE(Sections.SectionCode, MenteeProfiles.Section), e.g.
        // "BSIT 1A" from the Sections table when SectionID is set, falling
        // back to the bare MenteeProfiles.Section letter otherwise) — NOT
        // MenteeProfiles.Section alone, which is often just a letter like
        // "A" and would silently fail to match a session's "[BSIT 1A]" tag.
        public async Task NotifySessionScheduledAsync(int sessionId, int mentorId, DateTime sessionDate, string? sectionCode, string? slotName)
        {
            using var conn = new SqlConnection(_connectionString);

            var mentor = await conn.QueryFirstOrDefaultAsync<(string FirstName, string LastName)>(
                "SELECT FirstName, LastName FROM Users WHERE UserID = @Id", new { Id = mentorId });
            if (mentor.FirstName == null) return;

            var course = await conn.QuerySingleOrDefaultAsync<CourseGroup>(
                "SELECT c.School,c.CourseCode FROM SessionCourseScopes c JOIN Sessions s ON s.SessionID=c.SessionID WHERE c.SessionID=@SessionID AND c.Origin='Regular' AND s.MentorID=@MentorID",
                new { SessionID=sessionId, MentorID=mentorId });
            var mentees = await conn.QueryAsync<(string Email, string? Section, string? School, string? Course)>(
                @"SELECT vmd.Email, vmd.SectionCode AS Section, vmd.School, vmd.Course
                  FROM MentorMentee mm
                  JOIN vw_MenteeDetails vmd ON vmd.UserID = mm.MenteeID
                  WHERE mm.MentorID = @MentorID AND mm.IsActive = 1 AND vmd.IsActive = 1
                    AND (@CourseScoped=0 OR EXISTS(SELECT 1 FROM MenteeProfiles mp WHERE mp.UserID=mm.MenteeID AND ISNULL(mp.IsDropOut,0)=0))",
                new { MentorID = mentorId, CourseScoped=course!=null });

            IEnumerable<string> recipients;
            if (course != null)
            {
                recipients = mentees.Where(m => string.Equals(m.School,course.School,StringComparison.OrdinalIgnoreCase)
                    && AstraMentoring_Backend.Constants.SchoolCourses.NormalizeCode(m.Course)==AstraMentoring_Backend.Constants.SchoolCourses.NormalizeCode(course.CourseCode)).Select(m=>m.Email);
            }
            else if (string.IsNullOrWhiteSpace(sectionCode))
            {
                recipients = mentees.Select(m => m.Email);
            }
            else
            {
                var wantedSections = sectionCode.Split(',').Select(s => s.Trim()).ToHashSet();
                recipients = mentees.Where(m => m.Section != null && wantedSections.Contains(m.Section)).Select(m => m.Email);
            }

            var mentorName = $"{mentor.FirstName} {mentor.LastName}".Trim();
            var senderName = SenderNameFor("Mentor", mentorName);
            var sectionLine = course != null ? $"<p><strong>Course:</strong> {Enc(course.CourseCode)}</p>"
                : !string.IsNullOrWhiteSpace(sectionCode) ? $"<p><strong>Section:</strong> {Enc(sectionCode)}</p>" : string.Empty;
            // Null for a makeup session — a makeup slot comes from the
            // mentee's own booking request, which already has its own
            // notification (NotifySlotBookedAsync), not this one.
            var slotSuffix  = !string.IsNullOrWhiteSpace(slotName) ? $" ({slotName})" : "";

            var subject = $"New Session Scheduled{slotSuffix}";
            var body = $@"
                <p><strong>{Enc(mentorName)}</strong> scheduled a new session{Enc(slotSuffix)}:</p>
                <p>{sessionDate:MMMM d, yyyy} at {sessionDate:h:mm tt}</p>
                {sectionLine}";
            var html = BuildEmailHtml("Session Scheduled", body, "View Session", $"{_frontendBaseUrl}/MENTEE/HTML/sessions.html?id={sessionId}");

            foreach (var email in recipients)
                await SendEmailAsync(email, senderName, subject, html);
        }
    }
}
