import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

interface AnswerData {
  type: 'bar'
  labels: string[]
  values: number[]
}

export default function MiniBarChart({ data }: { data: AnswerData }) {
  const chartData = data.labels.map((label, i) => ({ label, value: data.values[i] ?? 0 }))
  return (
    <div className="mt-3 h-36 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#a1a1aa' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10, fill: '#a1a1aa' }} tickLine={false} axisLine={false} width={40} tickFormatter={v => `$${v}`} />
          <Tooltip
            contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 6 }}
            labelStyle={{ color: '#a1a1aa', fontSize: 11 }}
            itemStyle={{ color: '#e4e4e7', fontSize: 11 }}
            formatter={(v: number | undefined) => v !== undefined ? [`$${v.toFixed(2)}`, ''] : ['', '']}
          />
          <Bar dataKey="value" fill="#818cf8" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
