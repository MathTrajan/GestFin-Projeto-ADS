// Build enxuto do ECharts: importa só o necessário (pie/bar/line + tooltip/legend/grid),
// em vez do pacote inteiro (~2,7 MB). Reduz drasticamente o bundle do dashboard.
import * as echarts from 'echarts/core';
import { PieChart, BarChart, LineChart } from 'echarts/charts';
import { TooltipComponent, LegendComponent, GridComponent, GraphicComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  PieChart,
  BarChart,
  LineChart,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  GraphicComponent, // texto central da rosca (total)
  CanvasRenderer,
]);

export default echarts;
