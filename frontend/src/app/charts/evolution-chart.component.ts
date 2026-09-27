import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import type { EChartsOption } from 'echarts';

type EvoPoint = { month: string; income: number; expense: number; investment: number; balance: number };

const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
// "YYYY-MM" -> "mmm/yy"
function shortMonth(iso: string): string {
  const [y, m] = iso.split('-');
  return `${MONTHS_PT[Number(m) - 1] ?? m}/${y.slice(2)}`;
}

@Component({
  selector: 'app-evolution-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgxEchartsDirective],
  template: `<div echarts [options]="options()" class="w-full h-[240px] sm:h-[320px]"></div>`,
})
export class EvolutionChartComponent {
  private _data = signal<EvoPoint[]>([]);
  @Input() set data(v: EvoPoint[]) { this._data.set(v ?? []); }

  options = computed<EChartsOption>(() => {
    const d = this._data();
    const css = (n: string, fb: string) => { try { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb; } catch { return fb; } };
    const inkMuted = css('--ink-muted', '#64748B'), grid = css('--line', '#E2E8F0');
    // gradiente vertical p/ cada barra (topo vivo -> base translúcida)
    const grad = (top: string, bot: string): any => ({ type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: top }, { offset: 1, color: bot }] });
    const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    return {
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(120,120,120,.08)' } },
        backgroundColor: 'rgba(15,23,42,.94)', borderWidth: 0, borderRadius: 6, padding: [8, 12], textStyle: { color: '#fff', fontSize: 12 },
        valueFormatter: (v) => brl(Number(v)),
      },
      legend: { data: ['Entradas', 'Saídas', 'Saldo'], top: 0, icon: 'rect', textStyle: { color: inkMuted, fontSize: 11 }, itemWidth: 12, itemHeight: 9, itemGap: 16 },
      grid: { left: 4, right: 10, bottom: 4, top: 36, containLabel: true },
      xAxis: { type: 'category', data: d.map((x) => shortMonth(x.month)), boundaryGap: true, axisTick: { show: false }, axisLine: { lineStyle: { color: grid } }, axisLabel: { color: inkMuted, fontSize: 11, hideOverlap: true } },
      // valores abreviados (2,2k) p/ não cortar/alargar o eixo Y em telas estreitas
      yAxis: { type: 'value', splitLine: { lineStyle: { color: grid, type: 'dashed' } }, axisLabel: { color: inkMuted, fontSize: 11, formatter: (v: number) => Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k' : String(v) } },
      series: [
        // barras chapadas de topo reto: mesmo vocabulário visual dos cards
        { name: 'Entradas', type: 'bar', data: d.map((x) => x.income), barWidth: '30%', itemStyle: { color: '#15803D', borderRadius: [2, 2, 0, 0] }, emphasis: { itemStyle: { color: '#166534' } } },
        { name: 'Saídas', type: 'bar', data: d.map((x) => x.expense), barWidth: '30%', itemStyle: { color: '#DC2626', borderRadius: [2, 2, 0, 0] }, emphasis: { itemStyle: { color: '#B91C1C' } } },
        // linha de saldo (sobra) do mês, reta entre os pontos, sem área nem brilho
        { name: 'Saldo', type: 'line', smooth: false, symbol: 'rect', symbolSize: 7, z: 3, data: d.map((x) => x.balance),
          itemStyle: { color: '#1E3A8A' },
          lineStyle: { color: '#1E3A8A', width: 2 } },
      ],
    };
  });
}
