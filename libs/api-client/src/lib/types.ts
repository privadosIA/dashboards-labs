import type { HttpMethod, PathsWithMethod, SuccessResponseJSON } from 'openapi-typescript-helpers';
import type { paths } from './generated/schema';

export type Paths = paths;
export type Path<M extends HttpMethod> = PathsWithMethod<paths, M>;
/** The operation of a path and method, as the contract describes it. */
export type Operation<P extends keyof paths, M extends HttpMethod> = paths[P] extends Record<M, infer O> ? NonNullable<O> : never;

type ParamsOf<O> = O extends { parameters: infer P } ? P : {};
type Part<O, K extends 'path' | 'query'> = ParamsOf<O> extends { [k in K]?: infer X } ? NonNullable<X> : never;
type IsEmpty<T> = [T] extends [never] ? true : keyof T extends never ? true : false;

type PathPart<O> = IsEmpty<Part<O, 'path'>> extends true ? {} : { path: Part<O, 'path'> };
type QueryPart<O> = IsEmpty<Part<O, 'query'>> extends true ? {} : {} extends Part<O, 'query'> ? { query?: Part<O, 'query'> } : { query: Part<O, 'query'> };
// A body the contract marks optional (`requestBody` without `required`) is accepted but not demanded.
type BodyOf<O> = O extends { requestBody: { content: { 'application/json': infer B } } } ? B : O extends { requestBody?: { content: { 'application/json': infer B } } } ? B | undefined : never;
type BodyPart<O> = [BodyOf<O>] extends [never] ? {} : undefined extends BodyOf<O> ? { body?: BodyOf<O> } : { body: BodyOf<O> };

/** What a call needs: path parameters, query and body exactly as the operation declares them (nothing else is accepted). */
export type CallOptions<O> = PathPart<O> & QueryPart<O> & BodyPart<O>;
/** The call's options argument: required only when the operation needs something. */
export type CallArgs<O> = {} extends CallOptions<O> ? [options?: CallOptions<O>] : [options: CallOptions<O>];

/** The JSON of the success answer; `void` when the success answer has none (`204`, or a file). */
export type Answer<O extends Record<string | number, any>> = [SuccessResponseJSON<O>] extends [never] ? void : SuccessResponseJSON<O>;

type Content200<O> = O extends { responses: { 200: { content: infer C } } } ? C : never;

/** The `GET` paths whose `200` answer is an event stream. */
export type EventStreamPath = {
  [P in Path<'get'>]: 'text/event-stream' extends keyof Content200<Operation<P, 'get'>> ? P : never;
}[Path<'get'>];
