-- Run this once in SQL Server to enable dynamic QR attendance
CREATE TABLE QRTokens (
    TokenID   INT IDENTITY(1,1) PRIMARY KEY,
    Token     NVARCHAR(64)  NOT NULL,
    SessionID INT           NOT NULL,
    MenteeID  INT           NOT NULL,
    ExpiresAt DATETIME2     NOT NULL,
    IsUsed    BIT           NOT NULL DEFAULT 0,
    CONSTRAINT UQ_QRTokens_Token UNIQUE (Token),
    CONSTRAINT FK_QRTokens_Session FOREIGN KEY (SessionID) REFERENCES Sessions(SessionID),
    CONSTRAINT FK_QRTokens_Mentee  FOREIGN KEY (MenteeID)  REFERENCES Users(UserID)
);

CREATE INDEX IX_QRTokens_ExpiresAt ON QRTokens (ExpiresAt);
