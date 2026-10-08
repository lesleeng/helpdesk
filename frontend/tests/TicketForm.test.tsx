import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TicketForm from '../src/components/TicketForm/TicketForm'
import { mockFetch, renderApp } from './helpers'

const fields = [
  { name: 'software_name', label: 'Software / app name', type: 'text' },
  { name: 'severity', label: 'Severity', type: 'select', options: ['high', 'low'] },
]

describe('TicketForm', () => {
  it('shows dynamic fields for the chosen subcategory and submits extra fields', async () => {
    const calls = mockFetch({
      'GET /categories': [{ id: 1, name: 'Service Request' }],
      'GET /categories/1/subcategories': [
        { id: 7, category_id: 1, name: 'Software install', extra_fields_template: { fields } },
      ],
      'POST /tickets': { id: 42 },
    })
    const onCreated = vi.fn()
    const user = userEvent.setup()
    renderApp(<TicketForm onCreated={onCreated} />)

    expect(screen.queryByLabelText('Software / app name')).not.toBeInTheDocument()
    await screen.findByRole('option', { name: 'Service Request' })
    await user.selectOptions(screen.getByLabelText('Category'), '1')
    await screen.findByRole('option', { name: 'Software install' })
    await user.selectOptions(screen.getByLabelText('Request type'), '7')

    await user.type(screen.getByLabelText('Software / app name'), 'Zoom')
    await user.type(screen.getByLabelText('Title'), 'Need Zoom')
    await user.type(screen.getByLabelText('Description'), 'For meetings')
    await user.click(screen.getByRole('button', { name: 'Submit ticket' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(42))
    const post = calls.find((c) => c.init?.method === 'POST')!
    expect(JSON.parse(post.init!.body as string)).toMatchObject({
      title: 'Need Zoom',
      category_id: 1,
      subcategory_id: 7,
      urgency: 'medium',
      extra_fields: { software_name: 'Zoom' },
    })
  })

  it('resets dynamic fields when the category changes', async () => {
    mockFetch({
      'GET /categories': [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
      ],
      'GET /categories/1/subcategories': [
        { id: 7, category_id: 1, name: 'Sub', extra_fields_template: { fields } },
      ],
      'GET /categories/2/subcategories': [],
    })
    const user = userEvent.setup()
    renderApp(<TicketForm onCreated={() => {}} />)
    await screen.findByRole('option', { name: 'A' })
    await user.selectOptions(screen.getByLabelText('Category'), '1')
    await screen.findByRole('option', { name: 'Sub' })
    await user.selectOptions(screen.getByLabelText('Request type'), '7')
    expect(screen.getByLabelText('Software / app name')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Category'), '2')
    expect(screen.queryByLabelText('Software / app name')).not.toBeInTheDocument()
  })
})
