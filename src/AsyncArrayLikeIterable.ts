/**
 * An AsyncIterable endowed with lazy versions of Array's
 * every, some, forEach, map, filter, reduce, and flatMap
 */
export interface AsyncArrayLikeIterable<T> extends AsyncIterable<T> {
  /**
   * Determines whether the predicate returns true for every value.
   * @param predicate The predicate is evaluated only until it produces true.
   */
  every(predicate: (value: T) => boolean): Promise<boolean>;
  /**
   * Determines whether the predicate returns true for any value.
   * @param predicate The predicate is evaluated for every value.
   */
  some(predicate: (value: T) => unknown): Promise<boolean>;
  /**
   * Performs the specified action for each value.
   * @param callbackfn forEach calls the callbackfn function one time for each value.
   */
  forEach(callbackfn: (value: T) => void): void;
  /**
   * Returns an iterable where each value is the result of the given function applied to this
   * iterable's values.
   * @param callbackfn
   */
  map<U>(callbackfn: (value: T) => U): AsyncArrayLikeIterable<U>;
  /**
   * Returns an iterable that only produces values that the predicate evaluates to true.
   * @param predicate The filter method calls the predicate function one time for each value.
   */
  filter(predicate: (value: T) => unknown): AsyncArrayLikeIterable<T>;
  /**
   * Calls the specified function with the first two values. Then for every following value, the
   * function is called with the result of the previous invocation and that value.
   * @param callbackfn
   */
  reduce(
    callbackfn: (previousValue: T, currentValue: T) => T
  ): Promise<T | undefined>;
  /**
   * Calls the specified function with initialValue and the first value. Then calls the function
   * for each following value with the result of the previous invocation.
   * @param callbackfn
   * @param initialValue
   */
  reduce<U>(
    callbackfn: (previousValue: U, currentValue: T) => U,
    initialValue: U
  ): Promise<U>;
  /**
   * Maps every value with the given function. Then, instead of this producing the resulting
   * iterables, produce every value of the iterables in sequence.
   * @param callback A function that produces an iterable.
   */
  flatMap<U>(callback: (value: T) => Iterable<U>): AsyncArrayLikeIterable<U>;
}

export async function* flatMapIterable<T, U>(
  iter: AsyncIterable<T>,
  f: (v: T) => Iterable<U>
): AsyncIterable<U> {
  for await (const i of iter) {
    yield* f(i);
  }
}

export async function* mapIterable<T, U>(
  iter: AsyncIterable<T>,
  f: (v: T) => U
): AsyncIterable<U> {
  for await (const i of iter) {
    yield f(i);
  }
}

export async function* filterIterable<T>(
  iter: AsyncIterable<T>,
  f: (v: T) => boolean
): AsyncIterable<T> {
  for await (const i of iter) {
    if (f(i)) yield i;
  }
}

export async function reduceIterable<T>(
  iter: AsyncIterable<T>,
  f: (l: T, r: T) => T
): Promise<T> {
  let a;
  for await (const i of iter) {
    if (a === undefined) {
      a = i;
    } else a = f(a, i);
  }
  if (a === undefined) {
    throw new TypeError("reduce a done Iterable");
  }
  return a;
}

export async function reduceIterableWithInitial<T, U>(
  iter: AsyncIterable<T>,
  f: (l: U, r: T) => U,
  initial: U
): Promise<U> {
  let a = initial;
  for await (const i of iter) {
    a = f(a, i);
  }
  return a;
}

export default function AsyncArrayLikeIterable<T>(
  iter: AsyncIterable<T>
): AsyncArrayLikeIterable<T> {
  return {
    [Symbol.asyncIterator]: iter[Symbol.asyncIterator],
    async every(pred: (v: T) => boolean): Promise<boolean> {
      for await (const i of iter) {
        if (!pred(i)) return false;
      }
      return true;
    },
    async some(pred: (v: T) => boolean): Promise<boolean> {
      for await (const i of iter) {
        if (pred(i)) return true;
      }
      return false;
    },
    async forEach(f: (v: T) => void): Promise<void> {
      for await (const i of iter) {
        f(i);
      }
    },
    map<U>(f: (v: T) => U): AsyncArrayLikeIterable<U> {
      return AsyncArrayLikeIterable(mapIterable(iter, f));
    },
    filter(pred: (v: T) => boolean): AsyncArrayLikeIterable<T> {
      return AsyncArrayLikeIterable(filterIterable(iter, pred));
    },
    reduce<U>(f: (v: U, u: T) => U, initial?: U): Promise<U | undefined> {
      if (initial === undefined)
        return (reduceIterable(
          iter,
          (f as unknown) as (l: T, r: T) => T
        ) as unknown) as Promise<U>;
      else return reduceIterableWithInitial(iter, f, initial as U);
    },
    flatMap<U>(f: (v: T) => Iterable<U>): AsyncArrayLikeIterable<U> {
      return AsyncArrayLikeIterable(flatMapIterable(iter, f));
    }
  };
}
