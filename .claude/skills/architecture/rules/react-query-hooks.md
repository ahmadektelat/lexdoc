# React Query Hook Patterns

## Query Key Factory

Every entity gets a key factory object:

```typescript
export const xKeys = {
  all: ['x'] as const,
  lists: () => [...xKeys.all, 'list'] as const,
  list: (firmId: string, filters?: Partial<XListOptions>) =>
    [...xKeys.lists(), firmId, filters] as const,
  details: () => [...xKeys.all, 'detail'] as const,
  detail: (id: string) => [...xKeys.details(), id] as const,
};
```

## useQuery with Enabled Guard

Always guard queries on required params:

```typescript
export function useX(id: string | undefined) {
  return useQuery({
    queryKey: xKeys.detail(id!),
    queryFn: () => xService.getById(id!),
    enabled: !!id,
  });
}
```

## useInfiniteQuery for Cursor Pagination

```typescript
export function useXList(
  firmId: string | undefined,
  options?: Omit<XListOptions, 'firmId' | 'cursor' | 'direction'>
) {
  return useInfiniteQuery({
    queryKey: xKeys.list(firmId!, options),
    queryFn: ({ pageParam }) =>
      xService.list({
        firmId: firmId!,
        ...options,
        cursor: pageParam as string | undefined,
      }),
    enabled: !!firmId,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    getPreviousPageParam: (firstPage) =>
      firstPage.prevCursor || undefined,
  });
}
```

## useMutation with Invalidation

```typescript
export function useCreateX() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateXInput) => xService.create(input),
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: xKeys.lists() });
      queryClient.setQueryData(xKeys.detail(item.id), item);
    },
  });
}
```

## Delete Mutation Pattern

```typescript
export function useDeleteX() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => xService.delete(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: xKeys.lists() });
      queryClient.removeQueries({ queryKey: xKeys.detail(id) });
    },
  });
}
```

## Imports

```typescript
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { xService } from '@/services';
import { X, CreateXInput } from '@/types';
```
