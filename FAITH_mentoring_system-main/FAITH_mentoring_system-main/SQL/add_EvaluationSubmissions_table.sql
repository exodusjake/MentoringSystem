-- Self-reported evaluation submission tracking. The actual form answers
-- still live entirely on Google Forms (no API integration — see the
-- explanation given to the user: that needs a Google Cloud project +
-- OAuth consent the user has to set up outside this codebase first). This
-- just lets a mentee mark "I've submitted this" and lets Admin see who
-- has/hasn't, matching what Admin would otherwise track manually by
-- eyeballing the Google Form's response list.

CREATE TABLE dbo.EvaluationSubmissions (
    SubmissionID INT IDENTITY(1,1) PRIMARY KEY,
    LinkID       INT NOT NULL,
    MenteeID     INT NOT NULL,
    SubmittedAt  DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_EvalSub_Link   FOREIGN KEY (LinkID)   REFERENCES dbo.EvaluationLinks(LinkID)   ON DELETE CASCADE,
    CONSTRAINT FK_EvalSub_Mentee FOREIGN KEY (MenteeID) REFERENCES dbo.Users(UserID),
    -- One "I've submitted" mark per mentee per form — marking again just
    -- moves the timestamp instead of creating a duplicate row.
    CONSTRAINT UQ_EvalSub_LinkMentee UNIQUE (LinkID, MenteeID)
);
GO
