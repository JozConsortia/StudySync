"""Request bodies for history and saved answers. Limits keep one user from storing unbounded data."""

from typing import Literal

from pydantic import BaseModel, Field


class Step(BaseModel):
    title: str = Field("", max_length=500)
    detail: str = Field("", max_length=20000)


class Solution(BaseModel):
    answer: str = Field("", max_length=20000)
    steps: list[Step] = Field(default_factory=list, max_length=50)
    explanation: str = Field("", max_length=20000)
    tips: list[str] = Field(default_factory=list, max_length=10)


class HistoryQuestion(BaseModel):
    id: str = Field(min_length=1, max_length=20)
    number: str = Field("", max_length=20)
    text: str = Field(min_length=1, max_length=20000)
    marks: float | None = Field(None, ge=0, le=9999)
    solution: Solution | None = None


class HistorySession(BaseModel):
    kind: Literal["paper", "typed"] = "paper"
    title: str = Field(min_length=1, max_length=255)
    subject: str = Field("", max_length=100)
    fileName: str | None = Field(None, max_length=255)
    method: str | None = Field(None, max_length=20)
    pages: int = Field(0, ge=0, le=1000)
    createdAt: str | None = Field(None, max_length=40)
    questions: list[HistoryQuestion] = Field(default_factory=list, max_length=200)


class SavedAnswer(BaseModel):
    id: str = Field(min_length=1, max_length=400)  # the app's key for this question
    paperTitle: str = Field(min_length=1, max_length=255)
    subject: str = Field("", max_length=100)
    number: str = Field("", max_length=20)
    text: str = Field(min_length=1, max_length=20000)
    marks: float | None = Field(None, ge=0, le=9999)
    solution: Solution
    savedAt: str | None = Field(None, max_length=40)
