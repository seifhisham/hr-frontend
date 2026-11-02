# HR dashboard

Next.js dashboard for the Company HR REST backend.

Follow the [development guide](../docs/development.md#local-development) for environment setup and startup. The development dashboard uses port 3003. Configure `HR_API_URL` for the backend; browser requests use the dashboard's `/api` proxy.

Use the [project README](../README.md) to find product, deployment, mobile and API guides. See [AGENTS.md](AGENTS.md) before changing frontend code.

## Import employees from Google Forms

In Google Forms, download the responses as CSV. In the dashboard, open **Employees → Import CSV**, choose the file, and select a branch, department, schedule, and salary currency for that batch. Choose the date format used in the CSV; supply a fallback joining date only if answers are blank. Preview the rows, then import the valid employees.

The CSV must retain these form headers: `Full Name`, `National ID`, `Email`, `Job Title`, `Date Joined`, `Monthly Salary`. Other columns are ignored. Upload at most 100 responses and 50 KB per file; keep the header when splitting files. National IDs remain text. Salaries accept plain numbers, comma-separated thousands, `10k` as `10000`, and dot-separated thousands (`7.000` as `7000`). Plain decimal amounts such as `7000.50` keep their cents. Enter a missing salary (for example, `NA`) in its preview row, select **Update preview**, then import after reviewing the validated amount.

Existing national IDs or emails are skipped, and existing employee records are never updated. New accounts default to active employees with unique passwords made from four short random words and four digits (for example, `mango-river-cloud-lamp-4821`); account options can be changed in the preview. Download the account passwords PDF before closing. It lists names, emails, passwords, company code, and sign-in address, supports Arabic names, and continues across pages for larger batches. Distribute passwords privately and remove the PDF when no longer needed. Existing account passwords are unchanged. If an import response is interrupted, re-preview the CSV to skip saved accounts and use **Edit employee** to reset any passwords you did not receive.

The preview uses expandable employee cards. Edit names, identifiers, contact/job details, joining dates, salaries, branch/department/schedule assignments, currency, managers, and account options before importing. Batch defaults remain editable; employee-specific edits take precedence over the defaults. Select **Update preview** to validate changes before import. Role and branch permissions match the normal employee editor. Editing a skipped row does not update an existing employee; it is imported only if its identifiers describe a new employee.

Focused backend import tests run without a database: `npx vitest run --config vitest.config.import.ts` from `hr-backend`.
