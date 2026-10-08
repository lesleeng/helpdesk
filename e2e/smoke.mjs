// End-to-end smoke test. Needs the backend (AUTH_MODE=mock, migrated + seeded DB) on :8000
// and the Vite dev server on :5173. Set CHROMIUM_PATH to use an existing Chromium.
import { chromium } from 'playwright'
import assert from 'node:assert/strict'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH })
const page = await browser.newPage()
const problems = []
page.on('pageerror', (e) => problems.push(String(e)))
page.on('console', (m) => m.type() === 'error' && problems.push(m.text()))

async function signIn(label) {
  await page.goto(`${BASE}/login`)
  await page.getByLabel('Demo user').selectOption({ label })
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForSelector(`text=${label}`)
}
const signOut = () => page.getByRole('button', { name: 'Sign out' }).click()

const title = `E2E printer ${Date.now()}`

// user submits a ticket
await signIn('John Smith (user)')
assert.equal(await page.getByRole('link', { name: 'Dashboard' }).count(), 0)
await page.getByRole('link', { name: 'New Ticket' }).click()
await page.getByLabel('Category').selectOption({ label: 'Incident' })
await page.getByLabel('Request type').selectOption({ label: 'Printer issue' })
await page.getByLabel('Title').fill(title)
await page.getByLabel('Description').fill('Paper stuck')
await page.getByRole('button', { name: 'Submit ticket' }).click()
await page.waitForURL(/\/tickets\/\d+$/)
const ticketUrl = page.url()
await page.goto(`${BASE}/admin/dashboard`)
await page.waitForSelector('role=heading[name="My Tickets"]') // non-admin redirected
await signOut()

// admin triages it
await signIn('Admin User (admin)')
await page.getByRole('link', { name: 'All Tickets' }).click()
await page.getByLabel('Search tickets').fill(title)
await page.waitForSelector(`text=${title}`)
await page.waitForSelector('text=user-1')
await page.getByRole('link', { name: title }).click()
await page.getByLabel('Status').selectOption({ label: 'In Progress' })
await page.getByLabel('Priority').selectOption('high')
await page.getByRole('button', { name: 'Update ticket' }).click()
await page.waitForSelector('text=status: open → in_progress')
await page.waitForSelector('text=priority: medium → high')
await page.screenshot({ path: 'admin-detail.png', fullPage: true })
await page.getByRole('link', { name: 'Dashboard' }).click()
await page.waitForSelector('role=heading[name="By priority"]')
await page.screenshot({ path: 'admin-dashboard.png', fullPage: true })
// admin's own "My Tickets" must not list the user's ticket
await page.getByRole('link', { name: 'My Tickets' }).click()
await page.waitForSelector('text=No tickets found.')
await signOut()

// user sees the new status
await signIn('John Smith (user)')
await page.goto(ticketUrl)
await page.waitForSelector('text=In Progress')

await signOut()

// admin bulk-assigns it to tech staff
await signIn('Admin User (admin)')
await page.getByRole('link', { name: 'All Tickets' }).click()
await page.getByLabel('Search tickets').fill(title)
await page.waitForSelector(`text=${title}`)
await page.waitForFunction(
  () => document.querySelectorAll('[aria-label^="Select ticket #"]').length === 1,
)
await page.getByLabel(/Select ticket #/).check()
await page.getByLabel('Bulk priority').selectOption('urgent')
await page.getByLabel('Bulk assignee').selectOption({ label: 'Tina Tech' })
await page.getByRole('button', { name: 'Apply to 1 ticket' }).click()
await page.waitForSelector('role=cell[name="tech-1"]')
await page.waitForSelector('role=cell[name="urgent"]')
await signOut()

// tech staff works the assigned ticket, without admin-only controls
await signIn('Tina Tech (tech)')
assert.equal(await page.getByRole('link', { name: 'All Tickets' }).count(), 0)
await page.getByRole('link', { name: 'Assigned to me' }).click()
await page.getByLabel('Search tickets').fill(title)
await page.getByRole('link', { name: title }).click()
assert.equal(await page.getByLabel('Assignee').count(), 0)
await page.waitForSelector('text=SLA: ok')
await page.getByLabel('Status').selectOption({ label: 'Resolved' })
await page.getByRole('button', { name: 'Update ticket' }).click()
await page.waitForSelector('text=status: in_progress → resolved')
await page.screenshot({ path: 'tech-detail.png', fullPage: true })
await page.goto(`${BASE}/admin/reports`)
await page.waitForSelector('role=heading[name="My Tickets"]') // tech cannot open reports
await signOut()

// admin sees the result in the report
await signIn('Admin User (admin)')
await page.getByRole('link', { name: 'Reports' }).click()
await page.waitForSelector('role=heading[name="By assignee"]')
await page.waitForSelector('role=cell[name="Tina Tech"]')
await page.screenshot({ path: 'admin-reports.png', fullPage: true })

console.log('E2E OK; console/page errors:', problems)
await browser.close()
