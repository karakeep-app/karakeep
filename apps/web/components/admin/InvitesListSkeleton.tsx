import { AdminCard } from "@/components/admin/AdminCard";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const headerWidths = ["w-40", "w-28", "w-20", "w-20"];

export default function InvitesListSkeleton() {
  return (
    <AdminCard>
      <div className="flex flex-col gap-4">
        <div className="mb-2 flex items-center justify-between">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-9 w-9" />
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              {headerWidths.map((width, index) => (
                <TableHead key={`invite-list-header-${index}`}>
                  <Skeleton className={`h-4 ${width}`} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 2 }).map((_, rowIndex) => (
              <TableRow key={`invite-list-row-${rowIndex}`}>
                {headerWidths.map((width, cellIndex) => (
                  <TableCell key={`invite-list-cell-${rowIndex}-${cellIndex}`}>
                    {cellIndex === headerWidths.length - 1 ? (
                      <div className="flex gap-2">
                        <Skeleton className="h-6 w-6" />
                        <Skeleton className="h-6 w-6" />
                      </div>
                    ) : (
                      <Skeleton className={`h-4 ${width}`} />
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AdminCard>
  );
}
