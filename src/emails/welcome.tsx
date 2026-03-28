// ============================================================
// src/emails/welcome.tsx
// Placeholder welcome email template.
//
// USAGE:
//   import { render } from "@react-email/render";
//   import { WelcomeEmail } from "@/emails";
//
//   const html = await render(<WelcomeEmail name="Alice" appName="Acme" />);
//   await enqueueEmail({ to: user.email, subject: `Welcome to Acme!`, html });
//
// CUSTOMISATION:
//   - Replace the color palette, logo, and copy as needed.
//   - Add more dynamic props (e.g. ctaUrl, trialDays) to the Props interface.
//   - Preview locally with: npx email dev
// ============================================================

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface WelcomeEmailProps {
  /** Recipient's display name */
  name: string;
  /** Your application name */
  appName?: string;
  /** CTA button URL — e.g. your dashboard URL */
  ctaUrl?: string;
}

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------
export function WelcomeEmail({
  name = "there",
  appName = "Foundry",
  ctaUrl = "https://yourdomain.com/dashboard",
}: WelcomeEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>Welcome to {appName} — you&apos;re all set.</Preview>

      <Body style={styles.body}>
        <Container style={styles.container}>
          {/* Header */}
          <Section style={styles.header}>
            <Text style={styles.brand}>{appName}</Text>
          </Section>

          {/* Content */}
          <Section style={styles.content}>
            <Heading style={styles.heading}>Welcome, {name} 👋</Heading>

            <Text style={styles.paragraph}>
              Your account is ready. You can now log in and start using{" "}
              {appName}.
            </Text>

            <Text style={styles.paragraph}>
              If you have any questions, reply to this email and we&apos;ll get
              back to you as soon as possible.
            </Text>

            <Button style={styles.button} href={ctaUrl}>
              Go to Dashboard
            </Button>
          </Section>

          <Hr style={styles.divider} />

          {/* Footer */}
          <Section>
            <Text style={styles.footer}>
              You received this email because you signed up for {appName}.
              <br />
              If this wasn&apos;t you, please ignore this email.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// ---------------------------------------------------------------------------
// Inline styles
// React Email uses inline styles for maximum email-client compatibility.
// ---------------------------------------------------------------------------
const styles = {
  body: {
    backgroundColor: "#f4f4f5",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    margin: 0,
    padding: "40px 0",
  },
  container: {
    backgroundColor: "#ffffff",
    borderRadius: "8px",
    margin: "0 auto",
    maxWidth: "560px",
    overflow: "hidden",
  },
  header: {
    backgroundColor: "#18181b",
    padding: "24px 32px",
  },
  brand: {
    color: "#ffffff",
    fontSize: "20px",
    fontWeight: "700",
    margin: 0,
    letterSpacing: "-0.5px",
  },
  content: {
    padding: "32px 32px 24px",
  },
  heading: {
    color: "#18181b",
    fontSize: "24px",
    fontWeight: "700",
    lineHeight: "1.3",
    margin: "0 0 16px",
  },
  paragraph: {
    color: "#52525b",
    fontSize: "15px",
    lineHeight: "1.6",
    margin: "0 0 16px",
  },
  button: {
    backgroundColor: "#18181b",
    borderRadius: "6px",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "14px",
    fontWeight: "600",
    marginTop: "8px",
    padding: "12px 24px",
    textDecoration: "none",
  },
  divider: {
    borderColor: "#e4e4e7",
    margin: "0 32px",
  },
  footer: {
    color: "#a1a1aa",
    fontSize: "12px",
    lineHeight: "1.6",
    padding: "16px 32px 24px",
    margin: 0,
  },
} as const;
