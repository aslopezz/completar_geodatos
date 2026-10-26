import {
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { especieLabel, type Registro } from '#/lib/registros'

const PAGE_SIZE = 50

// Solo lo que la tabla usa: orden y paginación en el cliente. El filtrado lo hace la página
// (cascadas + "Buscar") y llega ya aplicado en `data`.
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
})

const helper = createColumnHelper<typeof features, Registro>()

const columns = helper.columns([
  // ISO yyyy-mm-dd: el orden alfanumérico coincide con el cronológico.
  helper.accessor('fecha', { id: 'fecha', header: 'Fecha', sortFn: 'alphanumeric', sortUndefined: 'last', cell: (c) => c.getValue() ?? '—' }),
  helper.accessor((r) => especieLabel(r), { id: 'especie', header: 'Especie', sortFn: 'text' }),
  helper.accessor('nombre_comun_terreno', {
    header: 'Nombre común',
    sortFn: 'text',
    sortUndefined: 'last',
    cell: (c) => c.getValue() ?? '—',
  }),
  helper.accessor('cantidad', { header: 'Cantidad', sortFn: 'alphanumeric', sortUndefined: 'last', cell: (c) => c.getValue() ?? '—' }),
  helper.accessor((r) => [r.localidad_especifica, r.nombre_comuna].filter(Boolean).join(', ') || undefined, {
    id: 'ubicacion',
    header: 'Ubicación',
    sortFn: 'text',
    sortUndefined: 'last',
    cell: (c) => c.getValue() ?? '—',
  }),
])

const MUTED_COLUMNS = new Set(['nombre_comun_terreno', 'ubicacion'])
const SORT_MARK = { asc: ' ▲', desc: ' ▼' } as const
const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const

export function RegistrosTable({ data }: { data: Registro[] }) {
  const table = useTable(
    {
      features,
      columns,
      data,
      getRowId: (r) => r.id_registro,
      initialState: { pagination: { pageIndex: 0, pageSize: PAGE_SIZE } },
    },
    // Esta tabla solo se vuelve a pintar cuando cambia el orden o la página.
    (state) => ({ sorting: state.sorting, pagination: state.pagination }),
  )

  const { pageIndex } = table.state.pagination
  const pageCount = Math.max(1, table.getPageCount())

  return (
    <>
      <div className="demo-table-shell">
        <table className="demo-table text-sm whitespace-nowrap">
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  return (
                    <th key={header.id} aria-sort={sorted ? ARIA_SORT[sorted] : undefined}>
                      <button type="button" className="cursor-pointer font-[inherit]" onClick={header.column.getToggleSortingHandler()}>
                        <table.FlexRender header={header} />
                        {sorted ? SORT_MARK[sorted] : ''}
                      </button>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getAllCells().map((cell) => (
                  <td key={cell.id} className={MUTED_COLUMNS.has(cell.column.id) ? 'demo-muted' : undefined}>
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="demo-muted">
                  Sin resultados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-sm">
        <button type="button" className="demo-button demo-button-secondary" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
          Anterior
        </button>
        <span className="demo-muted">
          Página {pageIndex + 1} de {pageCount}
        </span>
        <button type="button" className="demo-button demo-button-secondary" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
          Siguiente
        </button>
      </div>
    </>
  )
}
