const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');
const source = fs.readFileSync('AstraMentoring-Backend/AstraMentoring-Backend/Services/MonitorActivitiesService.cs','utf8');
const policy = fs.readFileSync('AstraMentoring-Backend/AstraMentoring-Backend/Services/CheckpointWindowPolicy.cs','utf8');
const availability = fs.readFileSync('AstraMentoring-Backend/AstraMentoring-Backend/Services/AvailabilityWorkflowService.cs','utf8');
const extract = (text, name) => text.match(new RegExp(`${name} = """([\\s\\S]*?)""";`))[1];
const tables = ['Sessions','Attendance','MenteeProfiles','Sections','MentorMentee','CalendarEvents','CheckpointLogs','SystemSettings','Availability','SessionRequests','MentorProfiles','ProofOfSession'];
// Execute the production expressions, changing only table names and Dapper's list parameter.
const isolated = sql => tables.reduce((text,table)=>text.replace(new RegExp(`\\b${table}\\b`,'g'),`#${table}`),sql)
  .replaceAll('dbo.#','#').replaceAll('IN @MentorIds','IN (1,2,3)');
const progress = isolated(extract(source,'SectionProgressSql'));
const summary = isolated(extract(source,'CheckpointSummarySql'));
const reportCtes=progress.slice(0,progress.indexOf('SELECT s.MentorID,s.SectionCode,COALESCE'));
const reportStates=reportCtes+isolated(extract(source,'ReportStatesSql'));
const migration=fs.readFileSync('SQL/20261009_qr_calendar_attendance.sql','utf8');
const fn=migration.match(/EXEC sys\.sp_executesql N'((?:''|[^'])*)';/)[1].replaceAll("''","'");
const checkpointAttendance=isolated(fn.match(/\bRETURN\s+([\s\S]*);\s*$/)[1]);

test('SQL Server historical metrics on connection-local temporary tables', {
  // Opt-in only: no app config, credentials, network server or application database.
  skip: process.env.ASTRA_LOCAL_TEMP_SQL !== '1' && 'Requires an already-running local MSSQLLocalDB; set ASTRA_LOCAL_TEMP_SQL=1'
}, () => {
  const state=spawnSync('SqlLocalDB',['info','MSSQLLocalDB'],{encoding:'utf8',timeout:10000});
  assert.match(state.stdout,/State:\s+Running/,'The local instance must already be running; this test must not start a service.');
  const qrGuard=isolated(policy.match(/CanAttendAsync[\s\S]*?"""([\s\S]*?)"""/)[1]);
  const sql = `
SET NOCOUNT ON;
CREATE TABLE #Sessions(SessionID int,MentorID int,SectionCode nvarchar(100),SlotName nvarchar(50),
 SessionDate datetime2,Status nvarchar(20),LogStatus nvarchar(20),SubmittedAt datetime2,
 RequestID int,SchoolYear nvarchar(20),Semester nvarchar(50),TimeEnd datetime2);
CREATE TABLE #Attendance(SessionID int,MenteeID int,IsPresent bit,ScannedAt datetime2);
CREATE TABLE #MenteeProfiles(UserID int,SectionID int,Section nvarchar(100),IsDropOut bit,Department nvarchar(50));
CREATE TABLE #Sections(SectionID int,SectionCode nvarchar(100));
CREATE TABLE #MentorMentee(MentorID int,MenteeID int,IsActive bit,AssignedDate datetime2);
CREATE TABLE #CalendarEvents(EventID int,EventType nvarchar(50),SlotName nvarchar(50),SchoolYear nvarchar(20),
 Semester nvarchar(50),StartDate datetime2,EndDate datetime2,IsPublished bit);
CREATE TABLE #CheckpointLogs(MentorID int,SectionCode nvarchar(100),SlotName nvarchar(50),SchoolYear nvarchar(20),
 Semester nvarchar(50),LogStatus nvarchar(20),SubmittedAt datetime2,NeedsUpdate bit);
CREATE TABLE #SystemSettings(SettingKey nvarchar(50),SettingValue nvarchar(50));
CREATE TABLE #SessionRequests(RequestID int,MenteeID int,Status nvarchar(50));
CREATE TABLE #CheckpointAttendance(MentorID int,MenteeID int,CheckpointKey nvarchar(100),Attended int);
CREATE TABLE #Availability(AvailabilityID int,MentorID int,SlotName nvarchar(50));
CREATE TABLE #MentorProfiles(UserID int,SignatureFilePath nvarchar(500));
CREATE TABLE #ProofOfSession(SessionID int,FilePath nvarchar(500));
INSERT #MentorProfiles VALUES(1,'/signature.png'),(2,'/signature2.png');
INSERT #ProofOfSession VALUES(1,'/proof.png'),(3,'/proof3.png');
CREATE TABLE #Progress(MentorID int,SectionCode nvarchar(100),CompletedSessions int,CompleteCount int,
 OnTimeCount int,RequiredSessions int,IsCurrentlyHandled bit);
CREATE TABLE #ReportStates(MentorID int,LateCount int,MissingCount int,IncompleteCount int);
CREATE TABLE #Summary(MentorID int,SlotName nvarchar(50),Completed bit,Attendees int);
INSERT #Sections VALUES(10,'IT-A'),(20,'IT-B'),(30,'ENG-A');
INSERT #MenteeProfiles VALUES(101,10,'IT-A',0,'Computing'),(102,10,'IT-A',0,'Computing'),
 (103,20,'IT-B',0,'Computing'),(104,20,'IT-B',1,'Computing'),(201,30,'ENG-A',0,'Engineering'),
 (105,10,'IT-A',0,'Computing'),(106,10,'IT-A',0,'Computing'),(107,10,'IT-A',0,'Computing'),(301,30,'ENG-A',0,'Engineering');
-- Late assignments must not manufacture payable attendance; raw history stays intact.
INSERT #MentorMentee VALUES(1,101,1,'2026-10-01'),(1,102,1,'2026-10-01'),(1,103,1,'2026-10-01'),
 (1,105,1,'2026-10-01'),(1,106,1,'2026-10-01'),(1,107,1,'2026-10-01'),(2,201,1,'2026-10-01'),(3,301,1,'2026-09-01');
INSERT #Sessions VALUES
 (1,1,'IT-A','Before Prelims','2026-09-28','Completed','Draft',NULL,NULL,'Y1','S1','2026-09-28'),
 (2,1,'IT-A','Before Prelims','2026-09-29','Completed','Draft',NULL,7,'Y1','S1','2026-09-29'),
 (3,1,'IT-B','Before Prelims','2026-09-28','Completed','Draft',NULL,NULL,'Y1','S1','2026-09-28'),
 (4,2,'ENG-A','Before Prelims','2026-09-28','Completed','Draft',NULL,NULL,'Y1','S1','2026-09-28'),
 (5,1,'IT-A','Before Finals','2026-09-28','Cancelled','Draft',NULL,NULL,'Y1','S1',NULL),
 (6,1,'IT-A','Before Finals','2026-09-28','Scheduled','Draft',NULL,NULL,'Y1','S1',NULL),
 (7,1,'IT-A','Before Prelims','2026-09-28','Completed','Draft',NULL,NULL,'Y1','S2','2026-09-28'),
 (8,1,'IT-A','Before Prelims','2026-09-28','Completed','Draft',NULL,NULL,'Y2','S1','2026-09-28'),
 (9,2,NULL,'After Prelims','2026-09-28','Completed','Draft',NULL,8,'Y1','S1','2026-09-28');
INSERT #Attendance VALUES(1,101,1,'2026-09-28'),(1,102,1,'2026-09-28'),(2,101,1,'2026-09-29'),
 (3,103,1,'2026-09-28'),(3,104,1,'2026-09-28'),(4,201,1,'2026-09-28'),
 (1,105,0,'2026-09-28'),(1,106,1,NULL),(5,107,1,'2026-09-28'),(6,107,1,'2026-09-28'),
 (7,107,1,'2026-09-28'),(8,107,1,'2026-09-28'),(9,201,1,'2026-09-28');
INSERT #CalendarEvents VALUES(1,'Session Schedule','Before Prelims','Y1','S1','2026-09-28','2026-09-29',1),
 (2,'Deadline','Before Prelims','Y1','S1','2026-09-30','2026-09-30',1);
INSERT #CalendarEvents VALUES
 (4,'Session Schedule','After Prelims','Y1','S1','2026-09-28','2026-09-29',1),
 (5,'Session Schedule','Before Prelims','Y2','S1','2026-09-28','2026-09-29',1),
 (6,'Session Schedule','Before Prelims','Y1','S2','2026-09-28','2026-09-29',1);
UPDATE #MentorMentee SET AssignedDate='2026-09-01' WHERE MenteeID IN (103,201,107);
INSERT #CheckpointLogs VALUES(1,'IT-A','Before Prelims','Y1','S1','Submitted','2026-09-29',0);
INSERT #SystemSettings VALUES('SchoolYear','Y1'),('Semester','S1');
INSERT #Availability VALUES(1,1,'Before Prelims');
-- Unverified presence must not block makeup; verified presence still does.
UPDATE #MentorMentee SET AssignedDate='2026-09-01' WHERE MenteeID IN (101,106);
DECLARE @AvailabilityID int=1,@MenteeID int=106;
CREATE TABLE #BookingGuard(N int);
INSERT #BookingGuard ${isolated(extract(availability,'CompletedCheckpointSql'))};
IF (SELECT N FROM #BookingGuard)<>0 THROW 51000,'Unverified presence blocked makeup',1;
DELETE #BookingGuard; SET @MenteeID=101;
INSERT #BookingGuard ${isolated(extract(availability,'CompletedCheckpointSql'))};
IF (SELECT N FROM #BookingGuard)<>1 THROW 51000,'Verified checkpoint allowed duplicate booking',1;
DECLARE @SchoolYear nvarchar(20)='Y1',@Semester nvarchar(50)='S1',@RequiredSessions int=6;
${progress.replace('SELECT s.MentorID,s.SectionCode,COALESCE','INSERT #Progress SELECT s.MentorID,s.SectionCode,COALESCE')}
INSERT #Summary ${summary}
INSERT #CheckpointAttendance ${checkpointAttendance};
IF (SELECT SUM(Attended) FROM #CheckpointAttendance WHERE MentorID=1)<>2 THROW 51000,'Mentee progress/payable attendance mismatch',1;
IF EXISTS(SELECT 1 FROM #CheckpointAttendance WHERE MenteeID=106 AND Attended<>0) THROW 51000,'Unverified progress credit',1;
IF (SELECT SUM(CompletedSessions) FROM #Progress WHERE MentorID=1)<>2 THROW 51000,'Section/checkpoint duplication',1;
IF (SELECT SUM(CompletedSessions) FROM #Progress WHERE MentorID=2)<>2 THROW 51000,'Mentor isolation/makeup-only attribution',1;
IF (SELECT Attendees FROM #Summary WHERE MentorID=1 AND SlotName='Before Prelims')<>2 THROW 51000,'Unique eligible attendance',1;
IF (SELECT Attendees FROM #Summary WHERE MentorID=2 AND SlotName='Before Prelims')<>1 THROW 51000,'Department/mentor isolation',1;
IF EXISTS(SELECT 1 FROM #Summary WHERE SlotName='Before Finals' AND (Completed=1 OR Attendees<>0)) THROW 51000,'Cancelled/unfinished credit',1;
INSERT #ReportStates ${reportStates};
IF (SELECT MissingCount FROM #ReportStates WHERE MentorID=3)<>1 THROW 51000,'No-session mentor missing report hidden',1;
IF (SELECT LateCount FROM #ReportStates WHERE MentorID=1)<>0 THROW 51000,'Missing report graded as late',1;
IF (SELECT MissingCount FROM #ReportStates WHERE MentorID=1)<>1 THROW 51000,'Missing section report hidden',1;
INSERT #CheckpointLogs VALUES(1,'IT-B','Before Prelims','Y1','S1','Submitted','2026-10-01',0);
DELETE #ReportStates;
INSERT #ReportStates ${reportStates};
IF (SELECT LateCount FROM #ReportStates WHERE MentorID=1)<>1 THROW 51000,'Actual late submission not counted',1;
IF (SELECT MissingCount FROM #ReportStates WHERE MentorID=1)<>0 THROW 51000,'Late complete submission considered missing',1;
DELETE #CheckpointLogs WHERE MentorID=1 AND SectionCode='IT-B';
IF (SELECT CompleteCount FROM #Progress WHERE MentorID=1 AND SectionCode='IT-A')<>1 THROW 51000,'Submitted eligible proof/signature missing credit',1;
UPDATE #MentorProfiles SET SignatureFilePath=NULL WHERE UserID=1;
DELETE #Progress;
${progress.replace('SELECT s.MentorID,s.SectionCode,COALESCE','INSERT #Progress SELECT s.MentorID,s.SectionCode,COALESCE')}
IF EXISTS(SELECT 1 FROM #Progress WHERE MentorID=1 AND CompleteCount<>0) THROW 51000,'Missing signature earned document credit',1;
UPDATE #MentorProfiles SET SignatureFilePath='/signature.png' WHERE UserID=1;
UPDATE #ProofOfSession SET FilePath='' WHERE SessionID=1;
DELETE #Progress;
${progress.replace('SELECT s.MentorID,s.SectionCode,COALESCE','INSERT #Progress SELECT s.MentorID,s.SectionCode,COALESCE')}
IF EXISTS(SELECT 1 FROM #Progress WHERE MentorID=1 AND CompleteCount<>0) THROW 51000,'Missing proof earned document credit',1;
UPDATE #ProofOfSession SET FilePath='/proof.png' WHERE SessionID=1;
-- Calendar edits alter official credit without changing raw attendance/history.
UPDATE #CalendarEvents SET StartDate='2026-10-05',EndDate='2026-10-06',IsPublished=0 WHERE EventType='Session Schedule';
DELETE #Progress; DELETE #Summary;
${progress.replace('SELECT s.MentorID,s.SectionCode,COALESCE','INSERT #Progress SELECT s.MentorID,s.SectionCode,COALESCE')}
INSERT #Summary ${summary}
IF EXISTS(SELECT 1 FROM #Progress WHERE CompletedSessions<>0 OR CompleteCount<>0) THROW 51000,'Calendar edit retained official credit',1;
IF EXISTS(SELECT 1 FROM #Summary WHERE Attendees<>0) THROW 51000,'Calendar edit retained payable attendance',1;
IF (SELECT COUNT(*) FROM #Attendance)<>13 THROW 51000,'History changed',1;
UPDATE #CalendarEvents SET StartDate='2026-09-28',EndDate='2026-09-29',IsPublished=1 WHERE EventType='Session Schedule';
-- Test a second academic year and semester using the same generalized expressions.
SET @SchoolYear='Y2'; DELETE #Progress; DELETE #Summary;
${progress.replace('SELECT s.MentorID,s.SectionCode,COALESCE','INSERT #Progress SELECT s.MentorID,s.SectionCode,COALESCE')}
INSERT #Summary ${summary}
IF (SELECT SUM(CompletedSessions) FROM #Progress WHERE MentorID=1)<>1 THROW 51000,'Year isolation',1;
IF (SELECT Attendees FROM #Summary WHERE MentorID=1)<>1 THROW 51000,'Year attendance isolation',1;
UPDATE #MentorMentee SET AssignedDate='2026-09-01' WHERE MenteeID=102;
SET @SchoolYear='Y1'; SET @Semester='S2'; DELETE #Summary;
INSERT #Summary ${summary}
IF (SELECT Attendees FROM #Summary WHERE MentorID=1)<>1 THROW 51000,'Semester attendance isolation',1;
-- Changing regular-session mentee profiles must not rewrite its stored section or invent scans.
UPDATE #MentorMentee SET AssignedDate='2026-10-01' WHERE MenteeID=102;
UPDATE #MenteeProfiles SET SectionID=30,Section='ENG-A' WHERE UserID=102;
SET @Semester='S1'; DELETE #Progress; DELETE #Summary;
${progress.replace('SELECT s.MentorID,s.SectionCode,COALESCE','INSERT #Progress SELECT s.MentorID,s.SectionCode,COALESCE')}
INSERT #Summary ${summary}
IF (SELECT CompletedSessions FROM #Progress WHERE MentorID=1 AND SectionCode='IT-A')<>1 THROW 51000,'Regular section attribution changed',1;
IF (SELECT Attendees FROM #Summary WHERE MentorID=1 AND SlotName='Before Prelims')<>2 THROW 51000,'Section edit invented/lost attendance',1;
-- Exercise the unchanged SQL used by scheduling and QR guards at inclusive boundaries.
DECLARE @SlotName nvarchar(50)='Before Prelims',@Date datetime2=DATEADD(HOUR,8,SYSUTCDATETIME());
INSERT #CalendarEvents VALUES(3,'Session Schedule',@SlotName,'Y1','S1',CAST(@Date AS date),CAST(@Date AS date),1);
CREATE TABLE #Guard(N int);
INSERT #Guard ${isolated(extract(policy,'WindowSql'))};
IF (SELECT N FROM #Guard)<>1 THROW 51000,'Inclusive boundary rejected',1;
DELETE #Guard; SET @Date=DATEADD(DAY,1,@Date);
INSERT #Guard ${isolated(extract(policy,'WindowSql'))};
IF (SELECT N FROM #Guard)<>0 THROW 51000,'Outside-window creation allowed',1;
DECLARE @sessionId int=6;
UPDATE #Sessions SET SessionDate=DATEADD(HOUR,8,SYSUTCDATETIME()),SlotName=@SlotName WHERE SessionID=@sessionId;
DELETE #Guard;
INSERT #Guard ${qrGuard};
IF (SELECT N FROM #Guard)<>1 THROW 51000,'Open QR window rejected',1;
UPDATE #CalendarEvents SET StartDate=DATEADD(DAY,-3,StartDate),EndDate=DATEADD(DAY,-2,EndDate) WHERE EventID=3;
DELETE #Guard;
INSERT #Guard ${qrGuard};
IF (SELECT N FROM #Guard)<>0 THROW 51000,'Closed QR window allowed',1;
PRINT 'PASS: isolated historical reporting, scheduling and QR window SQL';
`;
  const result=spawnSync('sqlcmd',['-S','(localdb)\\MSSQLLocalDB','-d','tempdb','-E','-b','-r','1'],{input:sql,encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,`${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
});

test('both Program Reports preserve distinct checkpoint attendance and honorarium',()=>{
  for(const portal of ['ADMIN_','HEAD']) {
    const context=vm.createContext({document:{addEventListener(){}},window:{addEventListener(){}},console});
    vm.runInContext(fs.readFileSync(`${portal}/JS/evaluation-ratings.js`,'utf8'),context);
    const row=vm.runInContext("programReportRow({slotAttendance:'Before Prelims:4, After Prelims:2'},['Before Prelims','After Prelims'])",context);
    assert.equal(row.sum,6); assert.equal(row.amount,300);
  }
});

test('overview and detail retain the shared checkpoint queries across all portals',()=>{
  assert.equal((source.match(/QueryAsync<MentorSectionProgressDto>\(SectionProgressSql/g)||[]).length,1);
  assert.match(source,/QueryMultipleAsync\(BuildOverviewMetricsSql\(\)/);
  assert.match(source,/var ctes = SectionProgressSql\[/);
  assert.match(source,/m\.SlotAttendance = string\.Join/);
  for(const file of ['ADMIN_/JS/sessions.js','HEAD/JS/mentor-performance.js','MENTOR/JS/mentor-dashboard.js','MENTOR/JS/logsheet.js','MENTEE/JS/mentee-dashboard.js','MENTEE/JS/sessions.js'])
    assert.match(fs.readFileSync(file,'utf8'),/MonitorActivities/);
});
