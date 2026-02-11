from pydantic import BaseModel, Field


class LogEntry(BaseModel):
    """A parsed security log entry."""

    index: int = Field(description="Original line index in the raw log input")
    timestamp: str = Field(default="", description="Normalized timestamp")
    source: str = Field(default="", description="Log source (e.g., sshd, sudo, scp)")
    event_type: str = Field(
        default="unknown",
        description="Event type (e.g., failed_auth, successful_auth, file_transfer, command_exec)",
    )
    source_ip: str = Field(default="", description="Source IP address")
    dest_ip: str = Field(default="", description="Destination IP address")
    user: str = Field(default="", description="Username involved")
    details: str = Field(default="", description="Additional parsed details")
    raw_text: str = Field(description="Original raw log line")
    is_valid: bool = Field(default=True, description="Whether parsing succeeded")
    parse_error: str | None = Field(
        default=None, description="Error message if parsing failed"
    )
