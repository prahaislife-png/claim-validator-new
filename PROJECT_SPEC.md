Build an MVP internal Claim Validation Tool.

Purpose:
Analyze uploaded claim documents and produce analysis results only. Do NOT build approval, rejection, or request-more-information decision logic.

User inputs:
- Partner Name
- Claimed Amount

Uploads:
- PDF
- PNG/JPG
- DOC/DOCX
- XLS/XLSX

Main behavior:
1. Accept only partner name and claimed amount as manual inputs.
2. Extract all other relevant data from uploaded documents.
3. Compare uploaded documents against the entered partner name and claimed amount.
4. Analyze uploaded documents against source guideline documents and produce neutral findings.
5. Include a separate section called "AI Screening" to detect possible document forgery, tampering, or anomaly indicators.
6. Produce analysis only, not a business decision.

Extract from uploaded documents:
- partner name
- invoice number
- invoice date
- vendor name
- request / approval number if present
- net amount
- VAT
- total amount
- currency
- activity description
- proof-of-performance indicators

Required result sections:
- Claim Inputs
- Uploaded Documents Summary
- Extracted Data
- Matching Analysis
- Guideline Analysis
- AI Screening
- Overall Summary

Matching Analysis should show:
- extracted partner names vs entered partner name
- extracted amounts vs entered claimed amount
- exact match / partial match / mismatch
- multiple totals found
- unclear totals
- currency inconsistencies
- missing financial fields

Guideline Analysis should show:
- document completeness observations
- invoice structure observations
- proof-of-performance observations
- missing support indicators
- claim documentation notes based on uploaded guide documents

AI Screening rules:
The AI Screening section must be advisory only and must not conclude fraud or forgery.
Use wording such as:
- possible anomaly detected
- possible manipulation indicator
- metadata inconsistency
- formatting inconsistency
- suspicious image region
- requires manual review

AI Screening checks should include:
- font inconsistency
- layout inconsistency
- spacing irregularities
- overwritten or edited-looking values
- suspicious signature/stamp placement
- image compression anomalies
- PDF metadata anomalies
- modified/created timestamp inconsistencies
- VAT/math inconsistencies
- duplicate invoice number detection
- inconsistent totals or dates across documents

Output rules:
- no approve/reject/request more info result
- neutral summary only
- document-specific findings
- severity labels: low / medium / high
- recommendations for manual review where relevant

UI:
1. Input form with only:
   - Partner Name
   - Claimed Amount
2. Document upload area
3. Analysis results page
4. Separate AI Screening section/card
5. Clean internal dashboard design

Important:
- Keep the system auditable
- AI Screening is only an indicator engine
- No final authenticity verdict
- No business decision layer in MVP