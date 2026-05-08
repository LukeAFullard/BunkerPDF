# Monetization Strategy

## Overview

BunkerPDF employs a Freemium model with Pro and Enterprise tiers, leveraging its zero-trust, edge-native architecture to provide a privacy-first document processing suite. This strategy balances user acquisition via the free tier with premium capabilities designed for professionals and enterprise deployments.

## Pricing Tiers

### 1. Free Tier
The Free tier is focused on user acquisition, providing essential tools and establishing trust through our 100% client-side execution.
*   **Target Audience:** Casual users, individuals, and those testing the privacy claim.
*   **Features Included:**
    *   Basic Document Manipulation (Merge, Split, Rotate, Reorder).
    *   Basic PII Scanner & True Redaction (using distilled AI models).
    *   Lightweight OCR for basic text extraction.
    *   Client-side execution with no data leaving the device.

### 2. Pro Tier
The Pro tier targets professionals who require advanced document processing, bulk actions, and high-fidelity extraction while maintaining absolute data privacy.
*   **Target Audience:** Lawyers, researchers, consultants, and data analysts.
*   **Features Included (Everything in Free, plus):**
    *   Advanced AI/NLP Models (heavier, more accurate NER and Summarization).
    *   High-fidelity Table Extraction to CSV/Excel using specialized engines.
    *   Batch Operations (Process folders of PDFs simultaneously).
    *   Advanced Export Options (DOCX, structured Markdown).
    *   Unlimited saved Workflow Recipes.

### 3. Enterprise Tier
The Enterprise tier is designed for organizations with strict compliance, security, and internal infrastructure requirements.
*   **Target Audience:** Corporate IT, government agencies, and healthcare organizations.
*   **Features Included (Everything in Pro, plus):**
    *   Air-gapped deployment packages (self-hosted).
    *   Centralized license management.
    *   Custom integration support and prioritized SLA.
    *   Pre-configured compliance reporting.

## Client-Side License Verification

A key challenge for a 100% offline, edge-native application is securely gating premium features without relying on a persistent backend server. We address this using an offline cryptographic license verification system.

### Ed25519 Cryptographic Licensing
*   **Mechanism:** When a user purchases or renews a Pro license, our billing server generates a license key (similar to a JWT) signed with an Ed25519 private key. The license contains the user's details, feature flags, and an expiration date.
*   **Verification:** The BunkerPDF client application embeds the corresponding Ed25519 public key. When a user inputs their license key, the application cryptographically verifies the signature offline.
*   **Benefits:**
    *   **True Offline Use:** The user can unlock and use Pro features entirely offline, honoring our "Zero Server" promise.
    *   **Tamper-Proof:** Any attempt to modify the license file (e.g., changing the expiration date) will invalidate the cryptographic signature.
*   **Limitations & Mitigation:** While a determined user could theoretically modify the client code to bypass the public key check, this requires significant technical effort. For the vast majority of our target audience, this system provides sufficient friction to enforce licensing. For Enterprise clients, the air-gapped deployment itself serves as the primary access control.
