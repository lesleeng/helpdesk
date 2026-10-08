import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BarChart from '../src/components/Chart/BarChart'
import ChartFrame from '../src/components/Chart/ChartFrame'
import LineChart from '../src/components/Chart/LineChart'
import { evenlySpaced, formatNumber, niceScale } from '../src/components/Chart/scale'

describe('scale helpers', () => {
  it('rounds the axis up to friendly ticks', () => {
    expect(niceScale(0)).toEqual({ max: 1, ticks: [0, 1] })
    expect(niceScale(7).ticks).toEqual([0, 2, 4, 6, 8])
    expect(niceScale(130).max).toBe(150)
    expect(niceScale(130).ticks[0]).toBe(0)
    expect(niceScale(0.8).max).toBeGreaterThanOrEqual(0.8)
  })

  it('formats numbers and spreads labels', () => {
    expect(formatNumber(1284)).toBe('1,284')
    expect(formatNumber(2.345)).toBe('2.3')
    expect(evenlySpaced(3, 6)).toEqual([0, 1, 2])
    expect(evenlySpaced(30, 4)).toEqual([0, 10, 19, 29])
  })
})

describe('LineChart', () => {
  const props = {
    ariaLabel: 'Tickets per day',
    labels: ['2026-10-01', '2026-10-02', '2026-10-03'],
    series: [
      { key: 'a', label: 'Created', tone: 'context' as const, values: [1, 4, 2] },
      { key: 'b', label: 'Resolved', tone: 'accent' as const, values: [0, 3, null] },
    ],
  }

  it('draws a line per series with gaps for missing values and a labelled group', () => {
    const { container } = render(<LineChart {...props} />)
    expect(screen.getByRole('group', { name: /Tickets per day/ })).toBeInTheDocument()
    const paths = container.querySelectorAll('path.chart-line')
    expect(paths).toHaveLength(2)
    expect(paths[0].getAttribute('d')).toMatch(/^M[\d.,]+ L[\d.,]+ L[\d.,]+$/)
    expect(paths[1].getAttribute('d')).not.toContain('NaN')
    expect(container.querySelectorAll('line.chart-grid').length).toBeGreaterThan(1)
  })

  it('shows every series at the position chosen with the keyboard', async () => {
    render(<LineChart {...props} format={(v) => `${v} tickets`} />)
    const chart = screen.getByRole('group')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    chart.focus()
    expect(await screen.findByRole('status')).toHaveTextContent('2 tickets')
    fireEvent.keyDown(chart, { key: 'ArrowLeft' })
    const tip = screen.getByRole('status')
    expect(tip).toHaveTextContent('4 tickets')
    expect(tip).toHaveTextContent('3 tickets')
    expect(tip).toHaveTextContent('Created')
    expect(tip).toHaveTextContent('Resolved')
    fireEvent.keyDown(chart, { key: 'Escape' })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('treats label text as text, not markup', () => {
    render(
      <LineChart
        ariaLabel="x"
        labels={['a', 'b']}
        series={[
          { key: 'a', label: '<img src=x onerror=alert(1)>', tone: 'accent', values: [1, 2] },
        ]}
      />,
    )
    fireEvent.keyDown(screen.getByRole('group'), { key: 'ArrowRight' })
    expect(screen.getByRole('status')).toHaveTextContent('<img src=x onerror=alert(1)>')
    expect(document.querySelector('img')).toBeNull()
  })

  it('handles a single point and an empty series', () => {
    const { container } = render(
      <LineChart
        ariaLabel="one"
        labels={['only']}
        series={[{ key: 'a', label: 'A', tone: 'accent', values: [3] }]}
      />,
    )
    expect(container.querySelector('circle')).not.toBeNull()
    expect(container.innerHTML).not.toContain('NaN')
  })

  it('respects a fixed domain', () => {
    const { container } = render(
      <LineChart
        ariaLabel="pct"
        labels={['a', 'b']}
        domain={[0, 100]}
        format={(v) => `${v}%`}
        series={[{ key: 'a', label: 'A', tone: 'accent', values: [50, 100] }]}
      />,
    )
    expect(container.textContent).toContain('100%')
    expect(container.textContent).not.toContain('125%')
  })
})

describe('BarChart', () => {
  it('lists each bar with its value and a hover title, scaled to the largest', () => {
    const { container } = render(
      <BarChart
        ariaLabel="Backlog"
        items={[
          { label: 'Under 1 day', value: 4 },
          { label: 'Over 7 days', value: 2, detail: 'oldest 12 days' },
          { label: 'Empty', value: null },
        ]}
      />,
    )
    expect(screen.getByRole('list', { name: 'Backlog' })).toBeInTheDocument()
    expect(screen.getByText('Under 1 day').closest('li')).toHaveAttribute('title', 'Under 1 day: 4')
    expect(screen.getByText('Over 7 days').closest('li')).toHaveAttribute(
      'title',
      'Over 7 days: 2 (oldest 12 days)',
    )
    expect(screen.getByText('No data')).toBeInTheDocument()
    const widths = Array.from(container.querySelectorAll<HTMLElement>('.bar-fill')).map(
      (e) => e.style.width,
    )
    expect(widths).toEqual(['100%', '50%', '0%'])
  })
})

describe('ChartFrame', () => {
  const table = { head: ['Day', 'Count'], rows: [['Oct 1', 3]] }

  it('offers the same data as a table', async () => {
    render(
      <ChartFrame title="Volume" table={table}>
        <p>the chart</p>
      </ChartFrame>,
    )
    expect(screen.getByText('the chart')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show table' }))
    expect(screen.queryByText('the chart')).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Count' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Oct 1' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show chart' }))
    expect(screen.getByText('the chart')).toBeInTheDocument()
  })

  it('shows a legend only when there are two or more series', () => {
    const { rerender } = render(
      <ChartFrame title="One" table={table} legend={[{ label: 'Only', tone: 'accent' }]}>
        <p>x</p>
      </ChartFrame>,
    )
    expect(screen.queryByRole('list', { name: 'Legend' })).not.toBeInTheDocument()
    rerender(
      <ChartFrame
        title="Two"
        table={table}
        legend={[
          { label: 'Created', tone: 'context' },
          { label: 'Resolved', tone: 'accent' },
        ]}
      >
        <p>x</p>
      </ChartFrame>,
    )
    expect(screen.getByRole('list', { name: 'Legend' })).toHaveTextContent('CreatedResolved')
  })
})
