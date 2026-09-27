import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import type { EChartsOption } from 'echarts';

type OutlookPoint = { month: string; total: number };

const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
// "YYYY-MM" -> "mmm/yy"
function shortMonth(iso: string): string {
  const [y, m] = iso.split('-');
  return `${MONTHS_PT[Number(m) - 1] ?? m}/${y.slice(2)}`;
}

// Barras "quanto de cada mês já está comprometido com parcelas" — o 1º ponto é
// o mês exibido (barra destacada), os demais são o que já foi lançado pra frente.
@Component({
  selector: 'app-installment-outlook-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgxEchartsDirective],
  template: `<div echarts [options]="options()" class="w-full h-[200px] sm:h-[240px]"></div>`,
})
export class InstallmentOutlookChartComponent {
  private _data = signal<OutlookPoint[]>([]);
  @Input() set data(v: OutlookPoint[]) { this._data.set(v ?? []); }

  options = computed<EChartsOption>(() => {
    const d = this._data();
    const css = (n: string, fb: string) => { try { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb; } catch { return fb; } };
    const inkMuted = css('--ink-muted', '#64748B'), grid = css('--line', '#E2E8F0');
    const grad = (top: string, bot: string): any => ({ type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: top }, { offset: 1, color: bot }] });
    const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    return {
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(120,120,120,.08)' } },
        backgroundColor: 'rgba(20,22,28,.92)', borderWidth: 0, padding: [8, 12], textStyle: { color: '#fff', fontSize: 12 },
        valueFormatter: (v) => brl(Number(v)),
      },
      grid: { left: 4, right: 10, bottom: 4, top: 14, containLabel: true },
      xAxis: { type: 'category', data: d.map((x) => shortMonth(x.month)), boundaryGap: true, axisTick: { show: false }, axisLine: { lineStyle: { color: grid } }, axisLabel: { color: inkMuted, fontSize: 11, hideOverlap: true } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: grid, type: 'dashed' } }, axisLabel: { color: inkMuted, fontSize: 11, formatter: (v: number) => Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k' : String(v) } },
      series: [
        {
          name: 'Parcelas', type: 'bar', barWidth: '46%',
          data: d.map((x, i) => ({
            value: x.total,
            // mês exibido em destaque; futuros esmaecem gradualmente
            itemStyle: { color: i === 0 ? '#1E3A8A' : '#93C5FD', borderRadius: [2, 2, 0, 0] },
          })),
          emphasis: { itemStyle: { color: '#2563EB' } },
        },
      ],
    };
  });
}
