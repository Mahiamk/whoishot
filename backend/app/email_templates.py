"""HTML Email Templates for WhoIsHot with unified violet/pink/sky branding."""

from typing import Any

BRAND_HEADER = """
<div style="background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 50%, #06b6d4 100%); padding: 24px; text-align: center; border-top-left-radius: 16px; border-top-right-radius: 16px;">
  <h1 style="color: #ffffff; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 26px; font-weight: 900; tracking-tight: -0.5px;">
    who<span style="color: #fef08a;">is</span>hot
  </h1>
  <p style="color: rgba(255,255,255,0.9); margin: 4px 0 0 0; font-family: sans-serif; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
    WhoIsHot Platform
  </p>
</div>
"""

BRAND_FOOTER = """
<div style="padding: 20px; text-align: center; background-color: #0f172a; border-bottom-left-radius: 16px; border-bottom-right-radius: 16px; border-top: 1px solid rgba(255,255,255,0.1);">
  <p style="color: #94a3b8; font-family: sans-serif; font-size: 12px; margin: 0 0 8px 0;">
    WhoIsHot — Friendly Campus Competition & Opportunities
  </p>
  <p style="color: #64748b; font-family: sans-serif; font-size: 11px; margin: 0;">
    To manage your email preferences, visit your account settings at <a href="{frontend_url}/me" style="color: #38bdf8; text-decoration: underline;">/me</a>.
  </p>
</div>
"""


def _wrap_body(content_html: str, frontend_url: str) -> str:
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #0f172a; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
    {BRAND_HEADER}
    <div style="padding: 28px 24px; color: #f8fafc; font-size: 15px; line-height: 1.6;">
      {content_html}
    </div>
    {BRAND_FOOTER.format(frontend_url=frontend_url)}
  </div>
</body>
</html>"""


def render_email(template_key: str, context: dict[str, Any], frontend_url: str = "http://localhost:5173") -> tuple[str, str]:
    """Returns tuple of (subject, html_body)."""

    if template_key == "verify_email":
        name = context.get("display_name", "Student")
        verification_url = context.get("verification_url", f"{frontend_url}/verify-email")
        subject = f"Activate your WhoIsHot account, {name}!"
        content = f"""
        <h2 style="color: #ffffff; margin-top: 0; font-size: 20px; font-weight: 700;">Activate Your Account ✉️</h2>
        <p>Hi <strong>{name}</strong>,</p>
        <p>Thank you for signing up for WhoIsHot! Please verify your email address to activate your account and log in.</p>
        
        <div style="text-align: center; margin: 28px 0;">
          <a href="{verification_url}" style="background: linear-gradient(135deg, #8b5cf6, #ec4899); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 9999px; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 4px 14px rgba(139, 92, 246, 0.4);">
            Activate My Account &rarr;
          </a>
        </div>

        <p style="font-size: 13px; color: #94a3b8;">Or copy and paste this link into your browser:<br>
        <a href="{verification_url}" style="color: #38bdf8; word-break: break-all;">{verification_url}</a></p>
        <p style="font-size: 12px; color: #64748b; margin-top: 20px;">If you didn't create an account, you can safely ignore this email.</p>
        """

    elif template_key == "welcome":
        name = context.get("display_name", "Student")
        subject = f"Welcome to WhoIsHot, {name}!"
        content = f"""
        <h2 style="color: #ffffff; margin-top: 0; font-size: 20px; font-weight: 700;">Welcome to WhoIsHot! 🔥</h2>
        <p>Hi <strong>{name}</strong>,</p>
        <p>Your WhoIsHot account is ready. Discover active student contests, join bracket rankings, or support fellow contestants across campuses!</p>
        
        <div style="text-align: center; margin: 28px 0;">
          <a href="{frontend_url}" style="background: linear-gradient(135deg, #8b5cf6, #ec4899); color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 9999px; font-weight: 700; font-size: 14px; display: inline-block;">
            Explore Active Contests &rarr;
          </a>
        </div>
        """

    elif template_key == "contest_joined":
        title = context.get("contest_title", "Contest")
        bracket = context.get("gender_category", "Bracket")
        join_code = context.get("contest_join_code", "")
        ends_at = context.get("ends_at", "")
        profile_url = f"{frontend_url}/contest/{join_code}"
        
        subject = f"You joined {title} on WhoIsHot!"
        content = f"""
        <h2 style="color: #ffffff; margin-top: 0; font-size: 20px; font-weight: 700;">Contest Entry Confirmed 🎉</h2>
        <p>You have successfully joined <strong>{title}</strong> in bracket <strong>{bracket}</strong>!</p>
        
        <div style="background-color: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 16px; margin: 20px 0;">
          <p style="margin: 0 0 8px 0;"><strong>Contest Code:</strong> <code style="background: #1e293b; padding: 2px 6px; border-radius: 4px; color: #38bdf8;">{join_code}</code></p>
          {f'<p style="margin: 0;"><strong>Ends At:</strong> {ends_at}</p>' if ends_at else ''}
        </div>

        <div style="text-align: center; margin: 24px 0;">
          <a href="{profile_url}" style="background: linear-gradient(135deg, #8b5cf6, #ec4899); color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 9999px; font-weight: 700; font-size: 14px; display: inline-block;">
            View Your Contest Profile &rarr;
          </a>
        </div>
        """

    elif template_key == "contest_joined_voter":
        title = context.get("contest_title", "Contest")
        join_code = context.get("contest_join_code", "")
        board_url = f"{frontend_url}/contest/{join_code}/board"

        subject = f"Voting in {title} — WhoIsHot"
        content = f"""
        <h2 style="color: #ffffff; margin-top: 0; font-size: 20px; font-weight: 700;">You're now voting! 🗳️</h2>
        <p>You submitted a score in <strong>{title}</strong>. You can compare contestants, rate criteria, and track leaderboard rankings anytime!</p>
        
        <div style="text-align: center; margin: 24px 0;">
          <a href="{board_url}" style="background: linear-gradient(135deg, #8b5cf6, #ec4899); color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 9999px; font-weight: 700; font-size: 14px; display: inline-block;">
            View Contest Leaderboard &rarr;
          </a>
        </div>
        """

    elif template_key == "contest_ending_soon":
        title = context.get("contest_title", "Contest")
        time_left = context.get("time_left", "soon")
        join_code = context.get("contest_join_code", "")
        contest_url = f"{frontend_url}/contest/{join_code}"

        subject = f"⏰ {title} is ending soon ({time_left})!"
        content = f"""
        <h2 style="color: #f59e0b; margin-top: 0; font-size: 20px; font-weight: 700;">Contest Ending Reminder ⏰</h2>
        <p><strong>{title}</strong> is entering its final hours! The contest closes in approximately <strong>{time_left}</strong>.</p>
        
        <p>Make sure to check final scores and rankings on the board before voting ends.</p>

        <div style="text-align: center; margin: 24px 0;">
          <a href="{contest_url}" style="background: linear-gradient(135deg, #f59e0b, #ec4899); color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 9999px; font-weight: 700; font-size: 14px; display: inline-block;">
            Check Rankings Now &rarr;
          </a>
        </div>
        """

    elif template_key == "verification_code":
        code = context.get("code", "")
        subject = f"Your WhoIsHot verification code: {code}"
        content = f"""
        <h2 style="color: #ffffff; margin-top: 0; font-size: 20px; font-weight: 700;">Verification Code</h2>
        <p>Your single-use security verification code for WhoIsHot is:</p>
        
        <div style="text-align: center; margin: 24px 0;">
          <span style="font-family: monospace; font-size: 32px; font-weight: 900; letter-spacing: 6px; background: #1e293b; color: #38bdf8; padding: 12px 24px; border-radius: 12px; border: 1px solid rgba(56, 189, 248, 0.3); display: inline-block;">
            {code}
          </span>
        </div>
        <p style="font-size: 13px; color: #94a3b8;">This code expires shortly. If you did not request this code, please ignore this email.</p>
        """

    elif template_key == "info_request":
        contestant_name = context.get("contestant_name", "Contestant")
        message = context.get("message", "")
        subject = "WhoIsHot Admin Notice — Response Needed"
        content = f"""
        <h2 style="color: #f59e0b; margin-top: 0; font-size: 20px; font-weight: 700;">Admin Request for Information</h2>
        <p>Hello <strong>{contestant_name}</strong>,</p>
        <p>An administrator has sent an official inquiry regarding your contestant profile:</p>

        <div style="background-color: rgba(245, 158, 11, 0.1); border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0; color: #fef08a; font-size: 14px;">{message}</p>
        </div>

        <p>Please log in to your account at <a href="{frontend_url}/me" style="color: #38bdf8; text-decoration: underline;">/me</a> (Notices tab) to respond before the deadline.</p>
        """

    elif template_key == "partner_introduction":
        company_name = context.get("company_name", "A Partner")
        inquiry_type = context.get("inquiry_type", "Opportunity")
        subject = f"WhoIsHot — Potential Opportunity from {company_name}"
        content = f"""
        <h2 style="color: #a855f7; margin-top: 0; font-size: 20px; font-weight: 700;">New Opportunity Introduction Proposal ✨</h2>
        <p>A verified partner (<strong>{company_name}</strong> - <em>{inquiry_type}</em>) has requested an introduction to your contestant profile.</p>

        <p>Please log in to your dashboard at <a href="{frontend_url}/me" style="color: #38bdf8; text-decoration: underline;">/me</a> (Notices tab) to review the details and accept or decline.</p>
        <p style="font-size: 13px; color: #94a3b8;">Your contact information is <strong>never shared automatically</strong> without your explicit consent.</p>
        """

    elif template_key == "payment_status":
        status_val = context.get("status", "updated")
        review_note = context.get("review_note", "")
        subject = f"WhoIsHot — Payment Status Update ({status_val.upper()})"
        content = f"""
        <h2 style="color: #ffffff; margin-top: 0; font-size: 20px; font-weight: 700;">Payment Status Update</h2>
        <p>Your recent payment submission has been reviewed by an administrator.</p>
        <p>Status: <strong style="color: {'#10b981' if status_val == 'paid' else '#ef4444'};">{status_val.upper()}</strong></p>

        {f'<div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; font-size: 13px;"><p style="margin:0;"><strong>Note:</strong> {review_note}</p></div>' if review_note else ''}
        """

    else:
        # Fallback template
        subject = context.get("subject", "WhoIsHot Notification")
        body_text = context.get("body", "")
        content = f"""
        <h2 style="color: #ffffff; margin-top: 0; font-size: 20px; font-weight: 700;">{subject}</h2>
        <p>{body_text}</p>
        """

    return subject, _wrap_body(content, frontend_url)

