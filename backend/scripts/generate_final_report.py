"""
Generates docs/reports/ServisAku_Backend_Final_Report.{docx,pdf} — the
Stage 9 final delivery report. Content is authored once, below, and
rendered to both formats so they can never drift from each other.

Run: python scripts/generate_final_report.py
"""
import os

from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, ListFlowable, ListItem,
)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "..", "docs", "reports")
os.makedirs(OUT_DIR, exist_ok=True)

DOCX_PATH = os.path.join(OUT_DIR, "ServisAku_Backend_Final_Report.docx")
PDF_PATH = os.path.join(OUT_DIR, "ServisAku_Backend_Final_Report.pdf")

NAVY = RGBColor(0x1B, 0x2A, 0x4A)
NAVY_HEX = colors.HexColor("#1B2A4A")

# ---------------------------------------------------------------------------
# Content model: a flat list of blocks. Each block is a tuple:
#   ("title", text)
#   ("h1", text)
#   ("h2", text)
#   ("p", text)
#   ("bullet", [items...])
#   ("table", [[header...], [row...], ...])
#   ("pagebreak",)
# ---------------------------------------------------------------------------

def build_content() -> list:
    C = []
    C.append(("title", "ServisAku Partner Backend"))
    C.append(("subtitle", "Final Delivery Report — Stages 6–9"))
    C.append(("meta", "Admin Backend · Analytics · Testing & QA · Documentation"))
    C.append(("pagebreak",))

    # 1. Executive Summary
    C.append(("h1", "1. Executive Summary"))
    C.append(("p",
        "This report covers Stages 6 through 9 of the ServisAku Partner backend build: "
        "the Admin Backend with role-based access control (RBAC), the Analytics reporting "
        "layer, an automated test suite, and this documentation pass. It builds directly on "
        "Stages 1–5 (Payment Gateway, Media Uploads, Notification Dispatcher, Smart Dispatch, "
        "and Real-Time Communication), all previously delivered and live-verified against the "
        "team's shared PostgreSQL database."))
    C.append(("p",
        "Across these four stages: 73 new admin endpoints and 11 new analytics endpoints were "
        "added (84 total, on top of the roughly 60 endpoints from Stages 1–5); a pre-existing, "
        "pre-seeded RBAC schema that no prior code had ever used was wired up end-to-end; a real "
        "automated pytest suite was built from nothing, reaching 208 passing tests at 74% "
        "statement coverage; and two genuine application bugs were found and fixed during live "
        "verification. Every stage's work was pushed to the shared GitHub repository after "
        "verification, with a detailed commit history preserved throughout."))
    C.append(("p",
        "The backend remains fully additive to the shared database — zero tables were created, "
        "dropped, or redesigned across all four stages. Every new feature maps onto tables that "
        "already existed, built by other team members for modules this backend was filling in."))

    # 2. Backend Architecture
    C.append(("h1", "2. Backend Architecture"))
    C.append(("p",
        "FastAPI (async) + SQLAlchemy 2.0 (async ORM) + PostgreSQL, structured in four layers: "
        "routes (request validation and orchestration only), services (business logic — payment "
        "gateways, Smart Dispatch, notifications, RBAC, real-time events), models (thin SQLAlchemy "
        "declarative classes), and schemas (Pydantic request/response contracts kept independent "
        "of the ORM models, so the external API shape can stay stable even when a table's real "
        "column doesn't match it 1:1)."))
    C.append(("p",
        "Two integration points use a provider-agnostic pattern uniformly: payments (Billplz/"
        "iPay88 behind a common gateway interface) and notifications (push/SMS/email behind a "
        "common registry with automatic provider fallback). Real-time events flow through a "
        "minimal in-process pub/sub bus (services/realtime/events.py) so business logic never "
        "imports the Socket.IO layer directly — this avoids a circular import and keeps the "
        "real-time transport swappable."))
    C.append(("p",
        "The RBAC layer added in Stage 6 (services/rbac.py) sits on top of the existing coarse "
        "role check (partner/consumer/admin from the JWT) as a second, granular layer: "
        "require_permission(\"partners.approve\") resolves a user's effective permissions via "
        "user_roles → roles → role_permissions → permissions — tables that existed and were "
        "pre-seeded before this project touched them, but had never been queried by any code."))

    # 3. Database Architecture
    C.append(("h1", "3. Database Architecture"))
    C.append(("p",
        "A single shared PostgreSQL database (servisakudb, AWS RDS, PostGIS-enabled), built up "
        "incrementally across many team members' modules — 83 tables as of the most recent full "
        "schema query, stable since Stage 4. This backend's discipline throughout every stage: "
        "query the live schema first, map to what actually exists, never assume or redesign."))
    C.append(("bullet", [
        "PostGIS geography columns (partners.home_location, consumer_addresses.location) power Smart Dispatch's proximity search via raw parameterized SQL (ST_Distance/ST_DWithin), not ORM-mapped.",
        "Every enum is Postgres-native (create_type=False) — SQLAlchemy never tries to recreate an existing type.",
        "Identity is centralized in a shared users table, the FK target for every module's user-linked rows.",
        "job_dispatches doubles as both the live offer queue and the permanent dispatch/assignment log — rows are never deleted, only status-transitioned.",
        "A generated column (audit_logs.retention_until) was discovered the hard way in Stage 6 — documented below under Testing Summary.",
        "No analytics views or materialized views exist in the schema — confirmed before Stage 7 — so every analytics endpoint computes live.",
    ]))

    # 4. API Documentation
    C.append(("h1", "4. API Documentation"))
    C.append(("p",
        "Full interactive documentation is served at /docs (Swagger UI) and /redoc, generated "
        "from FastAPI's OpenAPI schema — every endpoint has a description, permission "
        "requirement, and example request/response. 25 tag groups organize roughly 144 REST "
        "paths (170+ operations counting each HTTP method separately). API_TESTING_REPORT.md is "
        "the manually-verified companion checklist, tracking pass/fail status and notes per "
        "endpoint across every stage."))
    C.append(("table", [
        ["Stage", "Endpoint groups added", "Endpoint count"],
        ["1–3", "Consumer, Payments, Uploads, Notification Dispatch", "39"],
        ["4", "Smart Dispatch", "11"],
        ["5", "Chat (+ Socket.IO events)", "4"],
        ["6", "Admin (10 groups: Dashboard, RBAC, Users, Partners, Bookings, Catalog, Coupons, Settlements, Support, Training)", "73"],
        ["7", "Analytics", "11"],
    ]))

    # 5. Authentication Flow
    C.append(("h1", "5. Authentication Flow"))
    C.append(("p",
        "POST /auth/login (phone + password) or the OTP verification flow issues a short-lived "
        "JWT access token (15 min default) and a longer-lived refresh token (30 days default), "
        "each carrying a type claim so one can never be substituted for the other. Every "
        "protected route resolves the caller's own scope ID (partner_id/consumer_id/user_id) "
        "server-side from the token's sub claim — never from a client-supplied parameter — so "
        "cross-account access is structurally prevented, not just filtered after the fact. "
        "Stage 6 added a second authorization layer (RBAC) on top of this for admin endpoints, "
        "detailed in the Backend Architecture section above."))

    # 6. Payment Flow
    C.append(("h1", "6. Payment Flow"))
    C.append(("p",
        "Consumer creates a booking (PENDING_PAYMENT) → POST /payments/bookings/{id}/bill creates "
        "a gateway checkout bill (Billplz live/self-serve sandbox; iPay88 stubbed pending merchant "
        "credentials) behind a provider-agnostic gateway interface — swapping providers never "
        "touches route or business-logic code. The gateway's webhook (POST /payments/billplz/"
        "callback) verifies an HMAC signature before trusting any status change, then moves the "
        "booking to CONFIRMED and automatically triggers Smart Dispatch. Payments sit in "
        "HELD_IN_ESCROW until explicitly released by an admin; refunds follow a full approval "
        "workflow (REQUESTED → PENDING_APPROVAL → APPROVED → PROCESSING → COMPLETED/REJECTED/"
        "FAILED), every admin decision now logged to the Stage 6 audit trail."))

    # 7. Upload Flow
    C.append(("h1", "7. Upload Flow"))
    C.append(("p",
        "Avatar, KYC document, and job-photo uploads via Cloudinary's free tier, with two paths: "
        "a validated server-side upload (simplest) and a signed direct-to-Cloudinary upload for "
        "large files on slow connections. Every upload is validated by real magic-byte content "
        "sniffing (JPEG/PNG/WEBP signatures), not the client-supplied Content-Type header, which "
        "is trivially spoofable — a renamed .txt file is rejected regardless of its declared "
        "type. Stage 6 added admin-side KYC document review (verify/reject) on top of the "
        "existing partner-side upload flow."))

    # 8. Dispatch Flow
    C.append(("h1", "8. Dispatch Flow (Smart Dispatch, Stage 4)"))
    C.append(("p",
        "Triggered automatically when a booking's payment is confirmed. A candidate pipeline "
        "(services/dispatch/matching.py) finds nearby ACTIVE, available partners via PostGIS "
        "within their own service radius, filters by availability slot, skill match, blocked-"
        "match exclusion, and daily workload cap, then scores the remainder on a weighted "
        "formula (proximity 35%, rating 25%, completion rate 20%, language match 15%, workload "
        "5%). Offers are sequential, not broadcast — exactly one PENDING job_dispatches row "
        "exists per booking at a time, with a configurable acceptance timeout, automatic retry "
        "to the next-ranked candidate on decline or expiry, and a background sweep worker "
        "handling expiries independently of any active request. Manual admin override and full "
        "dispatch/assignment history are exposed via the API."))

    # 9. Notification Architecture
    C.append(("h1", "9. Notification Architecture"))
    C.append(("p",
        "A central dispatcher (services/notifications/dispatcher.py) always creates the in-app "
        "notification row, then best-effort delivers on every other requested channel (push via "
        "Firebase, email via a Resend → Brevo → MailerSend fallback chain, SMS via a mock "
        "provider pending a real SMS vendor), honoring per-user, per-category channel "
        "preferences and logging every delivery attempt — including \"no provider configured\" — "
        "to a dedicated delivery log table. A failing or unconfigured channel never breaks the "
        "business action that triggered it (registration, booking confirmation, payment, "
        "feedback); this was verified live and one real bug (a background-task database-session "
        "race) was found and fixed during Stage 3 development."))

    # 10. Socket.IO Architecture
    C.append(("h1", "10. Socket.IO Architecture (Stage 5)"))
    C.append(("p",
        "A JWT-authenticated python-socketio AsyncServer mounted alongside the REST API "
        "(uvicorn main:socket_app). Clients join role-scoped rooms (user:{id}, partner:{id}, "
        "consumer:{id}, booking:{id}, the last permission-checked per-join) and receive live "
        "chat messages, typing indicators, read receipts, partner location updates, presence, "
        "heartbeat, and — via the same in-process event bus business logic already emits to — "
        "dispatch job offers and booking status updates in real time. Presence and partner GPS "
        "location are intentionally not persisted (no dedicated table exists; both are "
        "inherently ephemeral). A significant, codebase-wide pre-existing timezone bug (asyncpg "
        "silently misinterpreting naive datetimes) and a structlog logging kwarg collision were "
        "both found and fixed during this stage's live verification."))

    # 11. Analytics Overview
    C.append(("h1", "11. Analytics Overview (Stage 7)"))
    C.append(("p",
        "11 read-only endpoints under /admin/analytics/*, gated by the Stage 6 RBAC reports.read "
        "permission: revenue, bookings, partner performance, consumers, trend metrics (a time-"
        "series companion to the Stage 6 dashboard's point-in-time snapshot), conversion funnel, "
        "cancellations, dispatch (a thin alias for the existing Stage 4 endpoint — verified "
        "byte-for-byte identical, not a duplicated implementation), payments, notifications, and "
        "support. No analytics view or materialized view exists in the live schema — confirmed "
        "before writing any code — so every number is computed live via aggregate SQL against "
        "tables already mapped in earlier stages."))

    # 12. Testing Summary
    C.append(("h1", "12. Testing Summary (Stage 8)"))
    C.append(("p",
        "A real automated pytest suite was built from scratch (none existed before Stage 8): "
        "unit tests (password hashing, JWT round-trips, upload MIME sniffing, KYC status "
        "mapping — no DB or network), API tests across every route file from every stage, "
        "genuine integration tests (a support-ticket lifecycle, a catalog CRUD lifecycle, an "
        "RBAC role-assignment lifecycle, and an end-to-end Smart Dispatch flow exercising real "
        "candidate ranking and the full start/decline/retry/accept engine path against the live "
        "database), and Socket.IO connection tests."))
    C.append(("table", [
        ["Metric", "Result"],
        ["Tests passing", "208 / 208"],
        ["Tests failing", "0"],
        ["Statement coverage (application code)", "74%"],
        ["Real application bugs found", "0 (expected — surface already thoroughly live-verified)"],
        ["Test bugs found and fixed during development", "4 (wrong endpoint paths/shapes, a Decimal-serializes-as-string gotcha)"],
    ]))
    C.append(("p",
        "The gap to the 80% coverage target is concentrated almost entirely in code paths gated "
        "behind unconfigured third-party credentials (Billplz, Cloudinary, Firebase, email "
        "providers — a gap documented since Stage 1–3, not introduced by this stage) and in "
        "services/realtime/socket_server.py, whose coverage number is understated because it "
        "runs in a separate uvicorn process that pytest-cov cannot instrument — that file was "
        "independently and extensively live-verified during Stage 5. Every validation, error-"
        "handling, and RBAC code path that doesn't require a live external call is tested."))
    C.append(("p",
        "The suite runs against the real shared development database — no separate test "
        "database is provisioned for this project. This is a deliberate, documented tradeoff "
        "(docs/TESTING_GUIDE.md): it caught two real schema-shape bugs a mocked database would "
        "have missed, at the cost of tests not being isolated from concurrent manual/team "
        "activity. Every data-creating test uses unique, timestamp-suffixed identifiers and is "
        "written to be safe to re-run indefinitely."))

    # 13. Security Review
    C.append(("h1", "13. Security Review"))
    C.append(("p",
        "JWT authentication (bcrypt-hashed passwords, separate access/refresh token types), "
        "two-layer authorization (coarse role check + Stage 6's granular RBAC, verified to fail "
        "closed for a zero-permission role), server-resolved ownership checks throughout (never "
        "client-supplied), Pydantic-validated input on every request body, magic-byte content "
        "validation on every file upload, and parameterized SQL everywhere (including the raw-"
        "SQL PostGIS and analytics queries). A full audit trail (admin_actions + audit_logs) "
        "covers every admin mutation across every stage, not just Stage 6's own new endpoints."))
    C.append(("p", "Known gaps, disclosed rather than hidden:"))
    C.append(("bullet", [
        "No rate limiting on any endpoint — recommended before public launch.",
        "CORS is wide open (ALLOWED_ORIGINS=[\"*\"]) — a development default that must be restricted before production.",
        "No JWT secret rotation / per-token revocation mechanism.",
        "The default JWT_SECRET_KEY in config.py is a placeholder — must be overridden in production.",
    ]))
    C.append(("p", "Full detail in docs/SECURITY.md."))

    # 14. Deployment Instructions
    C.append(("h1", "14. Deployment Instructions"))
    C.append(("p",
        "No production deployment target exists yet — development and verification have run "
        "against the shared RDS instance via an SSH tunnel from a local machine. The real ASGI "
        "entrypoint for production is uvicorn main:socket_app (not main:app, which drops "
        "real-time functionality). A known scaling caveat: the real-time event bus is "
        "in-process, so multi-worker/horizontal scaling needs either a Redis-backed Socket.IO "
        "message queue or sticky sessions before it can be safely load-balanced. Full checklist "
        "— environment variables, TLS termination, background-worker behavior, and recommended "
        "next steps — is in docs/DEPLOYMENT.md."))

    # 15. Git Commit History
    C.append(("h1", "15. Git Commit History (Stages 6–9)"))
    C.append(("p",
        "Pushed to origin/main at github.com/Dineshkuppuraj17/servisaku-partner-consumer. Each "
        "stage is one feature commit plus a short docs-update commit recording its own hash in "
        "docs/today-work/GIT_COMMITS.md — see that file for the complete history including "
        "Stages 1–5 and the repository migration."))
    C.append(("table", [
        ["Commit", "Description"],
        ["c07698f", "feat(admin): Stage 6 Admin Backend — RBAC, catalog, partner approval, ops"],
        ["326d9a2", "docs: record Stage 6 commit hash"],
        ["8e53f32", "feat(analytics): Stage 7 Analytics — 11 read-only reporting endpoints"],
        ["109da90", "docs: record Stage 7 commit hash"],
        ["7085a82", "test(qa): Stage 8 Testing & Quality Assurance — pytest suite, 208 tests"],
        ["bda3615", "docs: record Stage 8 commit hash"],
    ]))

    # 16. Future Improvements
    C.append(("h1", "16. Future Improvements"))
    C.append(("bullet", [
        "Obtain real Billplz, Cloudinary, Firebase, and email provider credentials — the single biggest remaining gap, blocking full end-to-end verification and full test coverage of those integrations.",
        "Add rate limiting and restrict CORS before any public/production launch.",
        "Resolve the jobs vs. bookings parallel-table structure (flagged since the original Payment Gateway stage) — payments live on bookings, not this app's own jobs table, and the two remain unconnected.",
        "Fix the codebase-wide asyncpg naive-datetime timezone bug in the pre-Stage-4 code paths that still use datetime.utcnow() instead of datetime.now(timezone.utc).",
        "Decide and implement a Socket.IO horizontal-scaling strategy (Redis-backed message queue) before deploying more than one worker process.",
        "Wire CI to run the pytest suite automatically on every pull request.",
        "Consider a per-role permission audit for the pre-seeded RBAC data — the READ_ONLY role currently has zero granted permissions, which may or may not be the intended design.",
        "Build out the deferred Stage 6/7 partial features once real usage data exists: training-progress write path for partners, subscription/package creation flow, surge-pricing-rule activation logic.",
    ]))
    C.append(("p",
        "This concludes the Stage 6–9 delivery. All work is committed and pushed to origin/main; "
        "no further implementation was started pending review and approval of this report."))

    return C


def render_docx(blocks: list, path: str) -> None:
    doc = Document()

    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)

    for block in blocks:
        kind = block[0]
        if kind == "title":
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p.add_run(block[1])
            run.font.size = Pt(28)
            run.font.bold = True
            run.font.color.rgb = NAVY
        elif kind == "subtitle":
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p.add_run(block[1])
            run.font.size = Pt(16)
            run.font.color.rgb = NAVY
        elif kind == "meta":
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p.add_run(block[1])
            run.font.size = Pt(11)
            run.font.italic = True
        elif kind == "pagebreak":
            doc.add_page_break()
        elif kind == "h1":
            h = doc.add_heading(block[1], level=1)
            for run in h.runs:
                run.font.color.rgb = NAVY
        elif kind == "h2":
            h = doc.add_heading(block[1], level=2)
            for run in h.runs:
                run.font.color.rgb = NAVY
        elif kind == "p":
            doc.add_paragraph(block[1])
        elif kind == "bullet":
            for item in block[1]:
                doc.add_paragraph(item, style="List Bullet")
        elif kind == "table":
            rows = block[1]
            table = doc.add_table(rows=len(rows), cols=len(rows[0]))
            table.style = "Light Grid Accent 1"
            for r, row in enumerate(rows):
                for c, cell_text in enumerate(row):
                    cell = table.cell(r, c)
                    cell.text = str(cell_text)
                    if r == 0:
                        for p in cell.paragraphs:
                            for run in p.runs:
                                run.font.bold = True
            doc.add_paragraph()

    doc.save(path)


def render_pdf(blocks: list, path: str) -> None:
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("TitleC", parent=styles["Title"], textColor=NAVY_HEX, fontSize=26, alignment=1)
    subtitle_style = ParagraphStyle("SubtitleC", parent=styles["Heading2"], textColor=NAVY_HEX, alignment=1, fontSize=15)
    meta_style = ParagraphStyle("MetaC", parent=styles["Normal"], alignment=1, fontSize=10, textColor=colors.grey)
    h1_style = ParagraphStyle("H1C", parent=styles["Heading1"], textColor=NAVY_HEX, spaceBefore=14, spaceAfter=8)
    body_style = ParagraphStyle("BodyC", parent=styles["BodyText"], spaceAfter=8, leading=15)
    bullet_style = ParagraphStyle("BulletC", parent=styles["BodyText"], leftIndent=14, spaceAfter=4, leading=14)

    doc = SimpleDocTemplate(
        path, pagesize=A4,
        topMargin=2 * cm, bottomMargin=2 * cm, leftMargin=2 * cm, rightMargin=2 * cm,
        title="ServisAku Partner Backend — Final Delivery Report",
    )
    story = []

    for block in blocks:
        kind = block[0]
        if kind == "title":
            story.append(Spacer(1, 5 * cm))
            story.append(Paragraph(block[1], title_style))
        elif kind == "subtitle":
            story.append(Spacer(1, 0.4 * cm))
            story.append(Paragraph(block[1], subtitle_style))
        elif kind == "meta":
            story.append(Spacer(1, 0.3 * cm))
            story.append(Paragraph(block[1], meta_style))
        elif kind == "pagebreak":
            story.append(PageBreak())
        elif kind == "h1":
            story.append(Paragraph(block[1], h1_style))
        elif kind == "p":
            story.append(Paragraph(block[1], body_style))
        elif kind == "bullet":
            items = [ListItem(Paragraph(t, bullet_style)) for t in block[1]]
            story.append(ListFlowable(items, bulletType="bullet", start="circle"))
            story.append(Spacer(1, 0.2 * cm))
        elif kind == "table":
            rows = block[1]
            wrapped = [[Paragraph(str(c), body_style) for c in row] for row in rows]
            col_count = len(rows[0])
            avail_width = A4[0] - 4 * cm
            t = Table(wrapped, colWidths=[avail_width / col_count] * col_count, repeatRows=1)
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), NAVY_HEX),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F2F4F8")]),
            ]))
            story.append(t)
            story.append(Spacer(1, 0.3 * cm))

    doc.build(story)


if __name__ == "__main__":
    content = build_content()
    render_docx(content, DOCX_PATH)
    print(f"Wrote {DOCX_PATH}")
    render_pdf(content, PDF_PATH)
    print(f"Wrote {PDF_PATH}")
