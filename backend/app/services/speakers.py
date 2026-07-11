"""
Attribute conversation transcript lines to different speakers.

Re-exports analysis helpers; prefer conversation_analysis.analyze_conversation.
"""

from app.services.conversation_analysis import (  # noqa: F401
    analyze_conversation,
    attribute_speakers,
)
