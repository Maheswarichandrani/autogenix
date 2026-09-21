from .base import BModel
from .enums import UserAction
from typing import List, Optional
from datetime import datetime
from uuid import UUID


class MessageBlockArtifactData(BModel):
    """Artifact data embedded in message blocks."""
    id: UUID
    artifact_type: str
    title: str
    content: dict


class MessageBlock(BModel):
    """A single block in a message's content array."""
    type: str  # "text" or "artifact"
    content: Optional[str] = None  # For text blocks
    artifact_id: Optional[str] = None  # For artifact blocks
    artifact_data: Optional[MessageBlockArtifactData] = None  # Populated artifact data


class MessageResponse(BModel):
    """Schema for message response."""
    id: UUID
    role: str  # user | conductor | artificer | guardian | system
    message_type: str
    content: List[dict]  # JSONB blocks array
    metadata: Optional[dict] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class MessageListResponse(BModel):
    """Schema for paginated message list response."""
    messages: List[dict]  # Using dict to allow custom serialization with artifact_data
    total: int
    offset: int
    has_more: bool


class SendMessageRequest(BModel):
    """
    Schema for sending a user action.

    Pipeline v2 actions:
      action              | content     | vars          | model
      ─────────────────────┼─────────────┼───────────────┼──────
      send_message        | required    |               |
      provide_env_vars    |             | required      |
      agent_continue      |             |               |
      agent_switch_model  |             |               | required
      agent_cancel        |             |               |
    """
    action: UserAction
    content: Optional[str] = ""
    vars: Optional[dict] = None      # Only for provide_env_vars action
    model: Optional[str] = None      # Only for agent_switch_model action
    budget: Optional[int] = None     # Optional iteration budget for continue/switch
