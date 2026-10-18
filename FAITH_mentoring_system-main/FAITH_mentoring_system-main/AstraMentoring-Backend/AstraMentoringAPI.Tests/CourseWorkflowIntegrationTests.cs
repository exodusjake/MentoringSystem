using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Services;
using AstraMentoring_Backend.Constants;
using AstraMentoring_Backend.Repositories;
using AstraMentoringAPI.Controllers;
using Microsoft.AspNetCore.Mvc;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using System.Security.Claims;

namespace AstraMentoringAPI.Tests;

public class CourseWorkflowIntegrationTests
{
    [Fact]
    public void CourseSelectionRules()
    {
        var bac=new CourseGroup("School of Humanities","BAC");
        var it=new CourseGroup("School of Technology","BSIT");
        Assert.Equal(bac,CoursePolicy.Select(new[]{bac},null,null));
        Assert.Null(CoursePolicy.Select(Array.Empty<CourseGroup>(),null,null));
        Assert.Null(CoursePolicy.Select(new[]{bac,it},null,null));
        Assert.Equal(it,CoursePolicy.Select(new[]{bac,it}," b sit ",it.School));
        Assert.Null(CoursePolicy.Select(new[]{bac},"BSIT",null));
        Assert.Null(SchoolCourses.Resolve("School of Technology","BAC"));
        Assert.NotNull(SchoolCourses.Resolve("School of Humanities","BAC"));
    }

    [Fact]
    [Trait("Category","LocalDb")]
    public async Task CourseOnlyWorkflowUsesPersistedAssignmentsAndPreservesHistory()
    {
        // Synthetic EMPTY local database; never application/RDS credentials.
        var name="AstraCourseTest_"+Guid.NewGuid().ToString("N");
        var masterCs="Server=(localdb)\\MSSQLLocalDB;Database=master;Integrated Security=True;TrustServerCertificate=True";
        Assert.Equal("(localdb)\\MSSQLLocalDB",new SqlConnectionStringBuilder(masterCs).DataSource);
        Assert.Equal("master",new SqlConnectionStringBuilder(masterCs).InitialCatalog);
        Assert.Matches("^AstraCourseTest_[a-f0-9]{32}$",name);
        await using var master=new SqlConnection(masterCs);await master.OpenAsync();
        await master.ExecuteAsync($"CREATE DATABASE [{name}]");
        try
        {
            var cs=new SqlConnectionStringBuilder(masterCs){InitialCatalog=name}.ConnectionString;
            Assert.Equal("(localdb)\\MSSQLLocalDB",new SqlConnectionStringBuilder(cs).DataSource);
            Assert.Equal(name,new SqlConnectionStringBuilder(cs).InitialCatalog);
            await using var conn=new SqlConnection(cs);await conn.OpenAsync();
            var root=new DirectoryInfo(AppContext.BaseDirectory);
            while(root!=null&&!File.Exists(Path.Combine(root.FullName,"SQL","_FULL_SCHEMA_SNAPSHOT.sql")))root=root.Parent;
            Assert.NotNull(root);
            var snapshot=await File.ReadAllTextAsync(Path.Combine(root!.FullName,"SQL","_FULL_SCHEMA_SNAPSHOT.sql"));
            Assert.DoesNotMatch(@"(?im)^\s*(USE\s|CREATE\s+DATABASE|ALTER\s+DATABASE|DROP\s+DATABASE)",snapshot);
            var batches=Regex.Split(snapshot,@"(?im)^GO\s*$");
            // Install tables first; stored procedure snapshots are explicitly
            // local test inputs, not evidence of current Production definitions.
            foreach(var batch in batches.Where(b=>!Regex.IsMatch(b,@"(?i)CREATE\s+(?:OR ALTER\s+)?(?:PROCEDURE|VIEW)")))
                if(!string.IsNullOrWhiteSpace(batch))await conn.ExecuteAsync(batch);
            var qrMigration=await File.ReadAllTextAsync(Path.Combine(root.FullName,"SQL","20261009_qr_calendar_attendance.sql"));
            var fn=Regex.Match(qrMigration,@"EXEC sys\.sp_executesql N'(CREATE OR ALTER FUNCTION[\s\S]*?)';").Groups[1].Value.Replace("''","'");
            Assert.NotEmpty(fn);await conn.ExecuteAsync(fn);
            foreach(var batch in batches.Where(b=>Regex.IsMatch(b,@"(?i)CREATE\s+(?:OR ALTER\s+)?(?:PROCEDURE|VIEW)")))await conn.ExecuteAsync(batch);
            await conn.ExecuteAsync(await File.ReadAllTextAsync(Path.Combine(root.FullName,"SQL","20261014_course_scopes.local.sql")));
            await conn.ExecuteAsync("ALTER TABLE Sessions ADD CancelledAt datetime2 NULL;");
            await conn.ExecuteAsync(await File.ReadAllTextAsync(Path.Combine(root.FullName,"SQL","20261014_delete_user_course_compatibility.sql")));
            var booking=await File.ReadAllTextAsync(Path.Combine(root.FullName,"SQL","availability_start_time_only.sql"));
            await conn.ExecuteAsync(Regex.Replace(booking[booking.IndexOf("CREATE OR ALTER PROCEDURE dbo.sp_SubmitSessionRequest",StringComparison.Ordinal)..],@"(?im)^GO\s*$",""));
            await conn.ExecuteAsync("""
                SET IDENTITY_INSERT Users ON;
                INSERT Users(UserID,FirstName,LastName,Email,PasswordHash,Role) VALUES
                (307,'Synthetic','Mentor','m307@example.invalid','unused','Mentor'),
                (600,'Synthetic','Multi','m600@example.invalid','unused','Mentor'),
                (700,'Synthetic','Empty','m700@example.invalid','unused','Mentor'),
                (308,'Synthetic','A','a@example.invalid','unused','Mentee'),
                (309,'Synthetic','B','b@example.invalid','unused','Mentee'),
                (601,'Synthetic','C','c@example.invalid','unused','Mentee'),
                (602,'Synthetic','D','d@example.invalid','unused','Mentee');
                SET IDENTITY_INSERT Users OFF;
                INSERT MentorProfiles(UserID,School,SignatureFilePath) VALUES(307,'School of Humanities','/synthetic-signature.png'),(600,'School of Technology',NULL),(700,NULL,NULL);
                INSERT MenteeProfiles(UserID,School,Course) VALUES(308,'School of Humanities','BAC'),(309,'School of Humanities','BAC'),(601,'School of Technology','BSIT'),(602,'School of Humanities','BAC');
                INSERT MentorMentee(MentorID,MenteeID,AssignedDate) VALUES(307,308,'2020-01-01'),(307,309,'2020-01-01'),(600,601,'2020-01-01'),(600,602,'2020-01-01');
                INSERT SystemSettings(SettingKey,SettingValue) VALUES('SchoolYear','2026-2027'),('Semester','1st Semester'),('SessionLimit1stSem','6');
                INSERT Sessions(MentorID,SessionDate,Status,SectionCode,SchoolYear,Semester,SlotName,Notes) VALUES(307,'2020-01-01','Completed','HISTORICAL','2019-2020','1st Semester','After Prelims','Preserve this');
                INSERT CheckpointLogs VALUES(307,'2019-2020','1st Semester','After Prelims','HISTORICAL','Submitted','2020-01-01',1);
                """);
            var config=new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?>{["ConnectionStrings:DefaultConnection"]=cs}).Build();
            var sessions=new SessionsService(null!,config);var qr=new QRAttendanceService(config);var admin=new SessionsAdminService(config);
            Assert.Equal("(localdb)\\MSSQLLocalDB",new SqlConnectionStringBuilder(cs).DataSource);
            Assert.StartsWith("AstraCourseTest_",new SqlConnectionStringBuilder(cs).InitialCatalog);
            var userRepo=new GenericRepository<User>(config);
            var menteeRepo=new GenericRepository<MenteeProfile>(config);
            var mentorRepo=new GenericRepository<MentorProfile>(config);
            var auth=new AuthService(userRepo,menteeRepo,mentorRepo,new GenericRepository<MentorMentee>(config),config);
            var profile=new ProfileService(userRepo,mentorRepo,menteeRepo,config);
            var invalid=await auth.RegisterMenteeAsync(new UserRegisterRequest{FirstName="Synthetic",LastName="Invalid",Email="invalid@example.invalid",Password="SyntheticOnly123!",School="School of Technology",Course="BAC"});
            Assert.False(invalid.Success);
            Assert.Equal(0,await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM Users WHERE Email='invalid@example.invalid'"));
            Assert.False(await profile.AssignMentorAsync(308,99999));
            Assert.True(await conn.ExecuteScalarAsync<bool>("SELECT IsActive FROM MentorMentee WHERE MentorID=307 AND MenteeID=308"));
            Assert.True(await profile.AssignMentorAsync(308,307));
            Assert.Equal(new DateTime(2020,1,1),await conn.ExecuteScalarAsync<DateTime>("SELECT AssignedDate FROM MentorMentee WHERE MentorID=307 AND MenteeID=308 AND IsActive=1"));
            var profileController=new MenteeProfilesController(new MenteeProfilesService(menteeRepo),profile);
            Assert.IsType<BadRequestObjectResult>(await profileController.Post(new MenteeProfile{UserID=308,School="School of Technology",Course="BAC"}));
            await conn.ExecuteAsync("UPDATE MenteeProfiles SET YearLevel='3rd Year',SignatureFilePath='/preserved.png' WHERE UserID=308");
            var profileId=await conn.ExecuteScalarAsync<int>("SELECT MenteeProfileID FROM MenteeProfiles WHERE UserID=308");
            Assert.IsType<OkObjectResult>(await profileController.Put(profileId,new MenteeProfile{Course="BAC"}));
            var preservedProfile=await profile.GetMenteeProfileAsync(308);
            Assert.NotNull(preservedProfile);Assert.Equal("3rd Year",preservedProfile.YearLevel);
            Assert.Equal("/preserved.png",preservedProfile.SignatureFilePath);Assert.Null(preservedProfile.SectionID);
            var date=DateTime.UtcNow.AddHours(8).AddMinutes(2);
            await conn.ExecuteAsync("""
                UPDATE MenteeProfiles SET Section='BSIT 1A' WHERE UserID=601;
                INSERT Sessions(MentorID,SessionDate,TimeEnd,Status,SectionCode,SchoolYear,Semester,SlotName,Notes)
                VALUES(600,'2020-01-01','2020-01-01T10:00:00','Completed','BSIT 1A','2019-2020','1st Semester','After Prelims','Legacy counted attendance');
                INSERT Attendance(SessionID,MenteeID,IsPresent,ScannedAt) SELECT SessionID,601,1,'2020-01-01T01:00:00' FROM Sessions WHERE Notes='Legacy counted attendance';
                INSERT CalendarEvents(Title,StartDate,EndDate,EventType,IsPublished,SlotName,SchoolYear,Semester)
                VALUES('Legacy schedule','2020-01-01','2020-01-02','Session Schedule',1,'After Prelims','2019-2020','1st Semester');
                """);
            var historicalBefore=await conn.ExecuteScalarAsync<int>("SELECT SUM(Attended) FROM fn_MenteeCheckpointAttendance('2019-2020','1st Semester') WHERE MentorID=600");
            Assert.Equal(1,historicalBefore);
            await conn.ExecuteAsync("INSERT CalendarEvents(Title,StartDate,EndDate,EventType,IsPublished,SlotName,SchoolYear,Semester) VALUES('Synthetic schedule',@date,@end,'Session Schedule',1,'After Prelims','2026-2027','1st Semester'),('Synthetic submission',@end,@end,'Deadline',1,'After Prelims','2026-2027','1st Semester')",new {date,end=date.AddDays(3)});
            var single=System.Text.Json.JsonSerializer.Deserialize<Session>("""
                {"MentorID":307,"SessionDate":"2026-10-14T13:05:00","Status":"Scheduled","Notes":"test","SectionCode":null,"SlotName":"After Prelims"}
                """)!;
            single.SessionDate=date;single.SchoolYear="2026-2027";single.Semester="1st Semester";
            SessionsController Controller(int mentor) => new(sessions,config,new EmailService(null!,config,NullLogger<EmailService>.Instance)) {
                ControllerContext=new ControllerContext {HttpContext=new DefaultHttpContext {
                    User=new ClaimsPrincipal(new ClaimsIdentity(new[]{new Claim(ClaimTypes.NameIdentifier,mentor.ToString()),new Claim(ClaimTypes.Role,"Mentor")}))
                }}
            };
            Assert.IsType<OkObjectResult>(await Controller(307).Post(single));
            Assert.Equal("BAC",single.CourseCode);Assert.Null(single.RequestID);
            Assert.IsType<BadRequestObjectResult>(await Controller(307).Post(single));
            Assert.IsType<ForbidResult>(await Controller(600).Post(single));
            foreach(var mentor in new[]{600,700})
                Assert.IsType<BadRequestObjectResult>(await Controller(mentor).Post(new Session{MentorID=mentor,SessionDate=date,SlotName="After Prelims"}));
            Assert.IsType<BadRequestObjectResult>(await Controller(307).Post(new Session{MentorID=307,CourseCode="BSIT",SessionDate=date,SlotName="After Prelims"}));
            Assert.Equal(SessionAddResult.DuplicateRegularSession,await sessions.Add(single));
            Assert.Equal(SessionAddResult.InvalidRegularSession,await sessions.Add(new Session{MentorID=600}));
            Assert.Equal(SessionAddResult.InvalidRegularSession,await sessions.Add(new Session{MentorID=700}));
            Assert.Equal(SessionAddResult.InvalidRegularSession,await sessions.Add(new Session{MentorID=307,CourseCode="BSIT"}));
            var multi=new Session{MentorID=600,CourseCode="BSIT",CourseSchool="School of Technology",SessionDate=date,SlotName="After Prelims",SchoolYear="2026-2027",Semester="1st Semester"};
            Assert.Equal(SessionAddResult.Created,await sessions.Add(multi));
            Assert.Single(await admin.GetSessionMenteesAsync(multi.SessionID));
            Assert.Equal(2,(await admin.GetSessionMenteesAsync(single.SessionID)).Count);
            await conn.ExecuteAsync("UPDATE Users SET IsActive=0 WHERE UserID=309");
            Assert.Single(await admin.GetSessionMenteesAsync(single.SessionID));
            Assert.Empty((await qr.GenerateTokenAsync(single.SessionID,309)).Token);
            await conn.ExecuteAsync("UPDATE Users SET IsActive=1 WHERE UserID=309; UPDATE MenteeProfiles SET IsDropOut=1 WHERE UserID=309");
            Assert.Single(await admin.GetSessionMenteesAsync(single.SessionID));
            Assert.Empty((await qr.GenerateTokenAsync(single.SessionID,309)).Token);
            await conn.ExecuteAsync("UPDATE MenteeProfiles SET IsDropOut=0 WHERE UserID=309");
            var revoked=await qr.GenerateTokenAsync(single.SessionID,309);
            await conn.ExecuteAsync("UPDATE MentorMentee SET IsActive=0 WHERE MentorID=307 AND MenteeID=309");
            Assert.False((await qr.ScanTokenAsync(revoked.Token,307,single.SessionID)).Success);
            await conn.ExecuteAsync("UPDATE MentorMentee SET IsActive=1 WHERE MentorID=307 AND MenteeID=309");
            Assert.Equal(new DateTime(2020,1,1),await conn.ExecuteScalarAsync<DateTime>("SELECT AssignedDate FROM MentorMentee WHERE MentorID=307 AND MenteeID=309"));
            Assert.Empty((await qr.GenerateTokenAsync(single.SessionID,601)).Token);
            var expired=await qr.GenerateTokenAsync(single.SessionID,309);
            await conn.ExecuteAsync("UPDATE QRTokens SET ExpiresAt=DATEADD(SECOND,-1,SYSUTCDATETIME()) WHERE Token=@Token",new {expired.Token});
            Assert.False((await qr.ScanTokenAsync(expired.Token,307,single.SessionID)).Success);
            Assert.Equal(0,await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM Attendance WHERE SessionID=@SessionID AND MenteeID=309",new {single.SessionID}));
            var token=await qr.GenerateTokenAsync(single.SessionID,308);Assert.NotEmpty(token.Token);
            Assert.False((await qr.ScanTokenAsync(token.Token,307,multi.SessionID)).Success);
            Assert.False((await qr.ScanTokenAsync(token.Token,600,single.SessionID)).Success);
            Assert.True((await qr.ScanTokenAsync(token.Token,307,single.SessionID)).Success);
            Assert.False((await qr.ScanTokenAsync(token.Token,307,single.SessionID)).Success);
            Assert.False(await sessions.UpdateCheckpointLogAsync(single,"BAC","Submitted","School of Humanities"));
            Assert.NotNull(await sessions.FinishAsync(single.SessionID,307));
            Assert.Empty((await qr.GenerateTokenAsync(single.SessionID,309)).Token);
            var proof=new ProofOfSessionService(null!,config);
            await Assert.ThrowsAsync<SqlException>(()=>proof.SaveUpload(new ProofOfSession{SessionID=multi.SessionID,UploadedByUserID=600,FilePath="/unverified.jpg",FileType="image",UploadedAt=DateTime.UtcNow},CancellationToken.None));
            Assert.Equal(0,await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM ProofOfSession WHERE SessionID=@id",new {id=multi.SessionID}));
            var uploaded=new ProofOfSession{SessionID=single.SessionID,UploadedByUserID=307,FilePath="/synthetic-proof.jpg",FileType="image",UploadedAt=DateTime.UtcNow};
            Assert.True(await proof.SaveUpload(uploaded,CancellationToken.None));
            uploaded.UploadedByUserID=600;
            await Assert.ThrowsAsync<SqlException>(()=>proof.SaveUpload(uploaded,CancellationToken.None));
            Assert.Equal("/synthetic-proof.jpg",await conn.ExecuteScalarAsync<string>("SELECT FilePath FROM ProofOfSession WHERE SessionID=@id",new {id=single.SessionID}));
            await conn.ExecuteAsync("ALTER TABLE ProofOfSession ADD CONSTRAINT CK_SyntheticProofFailure CHECK(FilePath<>'/failed.jpg')");
            uploaded.UploadedByUserID=307;uploaded.FilePath="/failed.jpg";
            await Assert.ThrowsAsync<SqlException>(()=>proof.SaveUpload(uploaded,CancellationToken.None));
            Assert.Equal("/synthetic-proof.jpg",await conn.ExecuteScalarAsync<string>("SELECT FilePath FROM ProofOfSession WHERE SessionID=@id",new {id=single.SessionID}));
            await conn.ExecuteAsync("ALTER TABLE ProofOfSession DROP CONSTRAINT CK_SyntheticProofFailure");
            uploaded.FilePath="/replacement.jpg";
            Assert.True(await proof.SaveUpload(uploaded,CancellationToken.None));
            Assert.Equal(1,await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM ProofOfSession WHERE SessionID=@id",new {id=single.SessionID}));
            Assert.True(await sessions.UpdateCheckpointLogAsync(single,"BAC","Submitted","School of Humanities"));
            var reports=await CourseWorkflow.ReportsAsync(conn,307,"2026-2027","1st Semester");
            Assert.True(reports.Single(r=>r.SlotName=="After Prelims").DocumentsComplete);
            var progress=new List<MentorSectionProgressDto>();await CourseWorkflow.ApplyProgressAsync(conn,307,"2026-2027","1st Semester",progress);
            Assert.Equal(1,Assert.Single(progress).CompletedSessions);
            Assert.Equal(1,progress[0].CompleteCount);
            var credited=(await conn.QueryAsync<(int MentorID,int MenteeID,string SlotName)>(CourseWorkflow.CreditedAttendanceSql,new {MentorIds=new[]{307},SchoolYear="2026-2027",Semester="1st Semester"})).ToArray();
            Assert.Single(credited);Assert.Equal(50,credited.Length*50);
            var logs=await admin.GetLogsheetAsync(307);
            Assert.Contains(logs.Sessions,r=>r.SessionID==single.SessionID&&r.LogStatus=="Submitted"&&r.Mentees.Count==2&&r.ProofFilePath=="/replacement.jpg");
            Assert.Equal(DateTimeKind.Utc,logs.Sessions.Single(r=>r.SessionID==single.SessionID).SubmittedAt!.Value.Kind);
            var availability=new AvailabilityWorkflowService(config);
            var slot=await availability.AddSlotAsync(307,date,new TimeSpan(23,59,59),"After Prelims");Assert.True(slot.ok,slot.error);
            var availableId=await conn.ExecuteScalarAsync<int>("SELECT MAX(AvailabilityID) FROM Availability");
            Assert.False((await availability.SubmitRequestAsync(308,availableId,null)).ok); // already attended
            var booked=await availability.SubmitRequestAsync(309,availableId,null);Assert.True(booked.ok,booked.error);
            var makeup=await conn.QuerySingleAsync<Session>("SELECT * FROM Sessions WHERE RequestID IS NOT NULL");
            Assert.Equal("Makeup",await conn.ExecuteScalarAsync<string>("SELECT Origin FROM SessionCourseScopes WHERE SessionID=@id",new {id=makeup.SessionID}));
            Assert.Null(makeup.SectionCode);
            var makeupToken=await qr.GenerateTokenAsync(makeup.SessionID,309);Assert.NotEmpty(makeupToken.Token);
            Assert.True((await qr.ScanTokenAsync(makeupToken.Token,307,makeup.SessionID)).Success);
            Assert.True(await conn.ExecuteScalarAsync<bool>("SELECT NeedsUpdate FROM CourseCheckpointLogs WHERE MentorID=307"));
            Assert.NotNull(await sessions.FinishAsync(makeup.SessionID,307));
            Assert.True(await sessions.UpdateCheckpointLogAsync(makeup,"BAC","Submitted","School of Humanities"));
            Assert.Equal(2,(await conn.QueryAsync<int>(CourseWorkflow.CreditedAttendanceSql.Replace("SELECT DISTINCT s.MentorID,a.MenteeID,s.SlotName","SELECT DISTINCT a.MenteeID"),new {MentorIds=new[]{307},SchoolYear="2026-2027",Semester="1st Semester"})).Count());
            var attendanceLogs=new AttendanceLogsService(config);
            var attendeeCards=await attendanceLogs.GetMentorMenteesAsync(307);
            Assert.All(attendeeCards.Mentees,m=>{Assert.Equal(1,m.TotalSessions);Assert.Equal(1,m.PresentCount);});
            var fullReport=await attendanceLogs.GetFullReportAsync(null);
            Assert.All(fullReport.Mentors.Single(m=>m.MentorID==307).Mentees,m=>Assert.Equal(1,m.PresentCount));
            var monitoring=new MonitorActivitiesService(config,new EvaluationRatingsService(config));
            var overview=await monitoring.GetMentorOverviewAsync();
            var overviewMentor=overview.Mentors.Single(m=>m.MentorID==307);
            Assert.Equal(1,overviewMentor.CompletedSessions);
            Assert.Equal(1,overviewMentor.CompleteCount);
            Assert.Contains("After Prelims:2",overviewMentor.SlotAttendance);
            var detail=await monitoring.GetMentorDetailAsync(307);
            Assert.NotNull(detail);Assert.Equal(1,detail.CompletedSessions);
            Assert.All(detail.Mentees,m=>Assert.Equal(1,m.SessionsAttended));
            var proofTracking=await new SessionProofsAdminService(config).GetAsync();
            Assert.False(proofTracking.Records.Single(r=>r.SessionID==single.SessionID).IsMakeup);
            Assert.True(proofTracking.Records.Single(r=>r.SessionID==makeup.SessionID).IsMakeup);
            var menteeSessions=await admin.GetSessionsForMenteeAsync(307,308);
            Assert.Contains(menteeSessions.Sessions,r=>r.SessionID==single.SessionID&&!r.IsMakeup&&r.HasVerifiedAttendance==true);
            var history=await attendanceLogs.GetMenteeHistoryAsync(309,307);
            Assert.True(history.Single(r=>r.SlotName=="After Prelims"&&r.SessionDate>=date).IsPresent);
            Assert.True(history.Single(r=>r.SlotName=="After Prelims"&&r.SessionDate>=date).IsMakeup);
            Assert.Equal(historicalBefore,await conn.ExecuteScalarAsync<int>("SELECT SUM(Attended) FROM fn_MenteeCheckpointAttendance('2019-2020','1st Semester') WHERE MentorID=600"));
            Assert.Equal(1,(await attendanceLogs.GetMenteeHistoryAsync(601,600)).Count(r=>r.IsPresent));
            Assert.Equal("HISTORICAL",await conn.ExecuteScalarAsync<string>("SELECT SectionCode FROM Sessions WHERE Notes='Preserve this'"));
            Assert.True(await conn.ExecuteScalarAsync<bool>("SELECT NeedsUpdate FROM CheckpointLogs WHERE SectionCode='HISTORICAL'"));
            await conn.ExecuteAsync("INSERT CalendarEvents(Title,StartDate,EndDate,EventType,IsPublished,SlotName,SchoolYear,Semester) VALUES('Multi-course schedule',@date,@end,'Session Schedule',1,'Before Finals','2026-2027','1st Semester')",new {date,end=date.AddDays(3)});
            var multiSlot=await availability.AddSlotAsync(600,date,new TimeSpan(23,59,59),"Before Finals");Assert.True(multiSlot.ok,multiSlot.error);
            var multiSlotId=await conn.ExecuteScalarAsync<int>("SELECT MAX(AvailabilityID) FROM Availability");
            Assert.True((await availability.SubmitRequestAsync(601,multiSlotId,null)).ok);
            Assert.True((await availability.SubmitRequestAsync(602,multiSlotId,null)).ok);
            var mixedMakeup=await conn.QuerySingleAsync<Session>("SELECT s.* FROM Sessions s JOIN SessionRequests sr ON sr.RequestID=s.RequestID WHERE sr.AvailabilityID=@multiSlotId",new {multiSlotId});
            Assert.Equal(2,await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM SessionCourseScopes WHERE SessionID=@SessionID",mixedMakeup));
            foreach(var mentee in new[]{601,602})
            {
                var mixedToken=await qr.GenerateTokenAsync(mixedMakeup.SessionID,mentee);
                Assert.True((await qr.ScanTokenAsync(mixedToken.Token,600,mixedMakeup.SessionID)).Success);
            }
            Assert.NotNull(await sessions.FinishAsync(mixedMakeup.SessionID,600));
            Assert.True(await sessions.UpdateCheckpointLogAsync(mixedMakeup,"BAC","Submitted","School of Humanities"));
            Assert.True(await sessions.UpdateCheckpointLogAsync(mixedMakeup,"BSIT","Submitted","School of Technology"));
            Assert.Equal(2,(await conn.QueryAsync<int>("SELECT MenteeID FROM SessionCourseMembers WHERE SessionID=@SessionID",mixedMakeup)).Count());
            await conn.ExecuteAsync("INSERT CalendarEvents(Title,StartDate,EndDate,EventType,IsPublished,SlotName,SchoolYear,Semester) VALUES('Second-semester schedule',@date,@end,'Session Schedule',1,'Before Midterms','2027-2028','2nd Semester')",new {date,end=date.AddDays(3)});
            var nextPeriod=new Session{MentorID=600,CourseCode="BSIT",CourseSchool="School of Technology",SlotName="Before Midterms",SessionDate=date,SchoolYear="2027-2028",Semester="2nd Semester"};
            Assert.Equal(SessionAddResult.Created,await sessions.Add(nextPeriod));
            Assert.Equal(5,(await CourseWorkflow.ReportsAsync(conn,600,"2027-2028","2nd Semester")).Count);
            Assert.Equal(historicalBefore,await conn.ExecuteScalarAsync<int>("SELECT SUM(Attended) FROM fn_MenteeCheckpointAttendance('2019-2020','1st Semester') WHERE MentorID=600"));
            await conn.ExecuteAsync("INSERT Sessions(MentorID,SessionDate,Status,SectionCode,SchoolYear,Semester,SlotName,Notes) VALUES(600,@date,'Scheduled','BSIT 1A','2026-2027','1st Semester','Before Midterms','Legacy current checkpoint')",new {date});
            Assert.Equal(SessionAddResult.DuplicateRegularSession,await sessions.Add(new Session{MentorID=600,CourseCode="BSIT",CourseSchool="School of Technology",SessionDate=date,SlotName="Before Midterms",SchoolYear="2026-2027",Semester="1st Semester"}));
            Assert.True(await sessions.CourseSlotExistsAsync(600,new CourseGroup("School of Technology","BSIT"),"2026-2027","1st Semester","Before Midterms",null));
            Assert.Equal(0,await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM SessionCourseScopes c JOIN Sessions s ON s.SessionID=c.SessionID WHERE s.Notes='Legacy current checkpoint'"));
            var mailConfig=new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?>{
                ["ConnectionStrings:DefaultConnection"]=cs,["Brevo:ApiKey"]="synthetic-no-network",["Brevo:SenderEmail"]="sender@example.invalid"
            }).Build();
            var mailFactory=new CapturingMailFactory();
            var mail=new EmailService(mailFactory,mailConfig,NullLogger<EmailService>.Instance);
            await mail.NotifySessionScheduledAsync(single.SessionID,307,date,"BAC","After Prelims");
            Assert.Equal(new[]{"a@example.invalid","b@example.invalid"},mailFactory.Recipients.Order().ToArray());
            mailFactory.Recipients.Clear();
            await mail.NotifySessionScheduledAsync(multi.SessionID,600,date,"BSIT","After Prelims");
            Assert.Equal(new[]{"c@example.invalid"},mailFactory.Recipients.ToArray());
            mailFactory.Recipients.Clear();
            var legacyId=await conn.ExecuteScalarAsync<int>("SELECT SessionID FROM Sessions WHERE Notes='Legacy current checkpoint'");
            await mail.NotifySessionScheduledAsync(legacyId,600,date,"BSIT 1A","Before Midterms");
            Assert.Equal(new[]{"c@example.invalid"},mailFactory.Recipients.ToArray());
            // Shared course members protect history even before attendance exists.
            await conn.ExecuteAsync("DELETE Attendance WHERE SessionID=@SessionID",mixedMakeup);
            Assert.NotNull(await profile.GetHardDeleteBlockReasonAsync(601));
            Assert.NotNull(await profile.GetHardDeleteBlockReasonAsync(600));
            var scopesBefore=await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM SessionCourseScopes");
            var membersBefore=await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM SessionCourseMembers");
            var logsBefore=await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM CourseCheckpointLogs");
            await conn.ExecuteAsync("""
                SET IDENTITY_INSERT Users ON;
                INSERT Users(UserID,FirstName,LastName,Email,PasswordHash,Role) VALUES(801,'Synthetic','Solo','solo@example.invalid','unused','Mentee');
                SET IDENTITY_INSERT Users OFF;
                INSERT MenteeProfiles(UserID,School,Course) VALUES(801,'School of Humanities','BAC');
                INSERT Availability(MentorID,AvailableDate,StartTime,EndTime,SlotName) VALUES(700,'2030-01-01','10:00','11:00','After Prelims');
                DECLARE @slot int=SCOPE_IDENTITY();
                INSERT SessionRequests(MenteeID,AvailabilityID,Status) VALUES(801,@slot,'Approved');
                DECLARE @request int=SCOPE_IDENTITY();
                INSERT Sessions(MentorID,SessionDate,Status,RequestID,SchoolYear,Semester,SlotName) VALUES(700,'2030-01-01','Scheduled',@request,'2030-2031','1st Semester','After Prelims');
                DECLARE @session int=SCOPE_IDENTITY();
                INSERT SessionCourseScopes VALUES(@session,'School of Humanities','BAC','Makeup');
                INSERT SessionCourseMembers VALUES(@session,801,'School of Humanities','BAC');
                CREATE TABLE dbo.DeletionRollbackProbe(SessionID int REFERENCES Sessions(SessionID));
                INSERT DeletionRollbackProbe VALUES(@session);
                """);
            Assert.Null(await profile.GetHardDeleteBlockReasonAsync(801));
            await Assert.ThrowsAsync<SqlException>(()=>profile.DeleteUser(801));
            Assert.Equal(scopesBefore+1,await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM SessionCourseScopes"));
            Assert.Equal(membersBefore+1,await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM SessionCourseMembers"));
            Assert.Equal(1,await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM Users WHERE UserID=801"));
            await conn.ExecuteAsync("DROP TABLE dbo.DeletionRollbackProbe");
            Assert.True(await profile.DeleteUser(801));
            Assert.Equal(0,await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM Users WHERE UserID=801"));
            Assert.Equal(scopesBefore,await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM SessionCourseScopes"));
            Assert.Equal(membersBefore,await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM SessionCourseMembers"));
            Assert.Equal(logsBefore,await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM CourseCheckpointLogs"));
            Assert.Equal("HISTORICAL",await conn.ExecuteScalarAsync<string>("SELECT SectionCode FROM Sessions WHERE Notes='Preserve this'"));
        }
        finally
        {
            SqlConnection.ClearAllPools();
            await master.ExecuteAsync($"ALTER DATABASE [{name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{name}]");
        }
    }

    private sealed class CapturingMailFactory : IHttpClientFactory
    {
        public List<string> Recipients {get;}=new();
        public HttpClient CreateClient(string name) => new(new Handler(Recipients));
        private sealed class Handler(List<string> recipients) : HttpMessageHandler
        {
            protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken cancellationToken)
            {
                using var body=System.Text.Json.JsonDocument.Parse(await request.Content!.ReadAsStringAsync(cancellationToken));
                recipients.Add(body.RootElement.GetProperty("to")[0].GetProperty("email").GetString()!);
                return new HttpResponseMessage(System.Net.HttpStatusCode.OK){Content=new StringContent("{}")};
            }
        }
    }
}
