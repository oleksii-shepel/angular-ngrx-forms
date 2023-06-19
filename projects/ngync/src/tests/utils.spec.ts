import { boxed, deepClone, deepCloneJSON, deepEqual, findProps, getValue, intersection, iterable, prop, setValue } from '../lib/shared/utils';
describe('utils', () => {
  it('should get value', () => {
    let obj1 = { a: { b: { c: 1 } } };
    let obj2 = { a: { b: [{c: 1}] } };
    let obj3 = { a: [{ b: { c: 1 } }] };
    let obj4 = [ { b: { c: 1 } } ];
    let obj5 = {a: Object(BigInt(1))};

    expect(getValue(obj1, 'a.b.c')).toEqual(1);
    expect(getValue(obj2, 'a.b.0.c')).toEqual(1);
    expect(getValue(obj3, 'a.0.b.c')).toEqual(1);
    expect(getValue(obj4, '0.b.c')).toEqual(1);
    expect(getValue(obj5, 'a').valueOf()).toEqual(1n);
  });

  it('should set value', () => {
    let obj1 = { a: { b: { c: 1 } } };
    let obj2 = { a: { b: [{c: 1}] } };
    let obj3 = { a: [{ b: { c: 1 } }] };
    let obj4 = [ { b: { c: 1 } } ];

    expect(getValue(setValue(obj1, 'a.b.c', 2), 'a.b.c')).toEqual(2);
    expect(getValue(setValue(obj2, 'a.b.0.c', 2), 'a.b.0.c')).toEqual(2);
    expect(getValue(setValue(obj3, 'a.0.b.c', 2), 'a.0.b.c')).toEqual(2);
    expect(getValue(setValue(obj4, '0.b.c', 2), '0.b.c')).toEqual(2);
  });

  it('should iterate', () => {
    let obj = { a: 1, b: 2, c: 3 };
    let arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

    expect([...iterable(obj)]).toEqual([1, 2, 3]);
    expect([...iterable(arr)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it('should get prop', () => {
    type Obj = { a: number; b: number; c: number; d: {a : number; b: number[]} }
    let obj: Obj = { a: 1, b: 2, c: 3, d: { a : 1, b: [1, 2, 3]} };

    expect(prop<Obj>(x => x.a)).toEqual('a');
    expect(prop<Obj>(x => x.b)).toEqual('b');
    expect(prop<Obj>(x => x.c)).toEqual('c');
    expect(prop<Obj>(x => x.d.a)).toEqual('d.a');
    expect(prop<Obj>(x => x.d.b[0])).toEqual('d.b.0');
  });

  it('should find props', () => {
    let obj = { a: 1, b: 2, c: 3, d: { a : 1, b: [1, 2, 3]}, e: BigInt(1) };
    let obj2 = { a: Object(BigInt(1)), b: Object(false) };

    expect(findProps(obj)).toEqual(['a', 'b', 'c', 'd.a', 'd.b.0', 'd.b.1', 'd.b.2', 'e']);
    expect(findProps(obj2)).toEqual(['a', 'b']);
  });

  it('should deep equal', () => {
    let obj1 = { a: 1, b: 2, c: 3 };
    let obj2 = { a: 1, b: 2, c: 3 };
    let obj3 = { a: 1, b: 2, c: 4 };

    expect(deepEqual(obj1, obj2)).toEqual(true);
    expect(deepEqual(obj1, obj3)).toEqual(false);
  });

  it('should deep clone', () => {
    let date = new Date();
    let obj1 = { a: 1, b: 2, c: 3, d: BigInt(12121212), e: date };
    let obj2 = { a: 1, b: 2, c: 3, d: BigInt(12121212), e: date };
    let obj3 = { a: 1, b: 2, c: 4, d: BigInt(12121213), e: date };
    let obj4 = { a: 1, b: 2, c: 4, d: BigInt(12121212), e: new Date() };
    let obj5 = { a: 1, b: 2, c: 4, d: Object(BigInt(12121212)), e: new Date() };

    expect(deepEqual(deepClone(obj1), obj1)).toEqual(true);
    expect(deepEqual(deepClone(obj2), obj2)).toEqual(true);
    expect(deepEqual(deepClone(obj3), obj3)).toEqual(true);
    expect(deepEqual(deepClone(obj4), obj4)).toEqual(true);
    expect(deepEqual(deepClone(obj5), obj5)).toEqual(true);
  });

  it('should deep clone json', () => {
    let obj1 = { a: 1, b: 2, c: 3 };
    let obj2 = { a: 1, b: 2, c: 3 };
    let obj3 = { a: 1, b: 2, c: 4 };

    expect(deepEqual(deepCloneJSON(obj1), obj2)).toEqual(true);
    expect(deepEqual(deepCloneJSON(obj1), obj3)).toEqual(false);
  });

  it('boxed', () => {
    let obj1 = { a: 1, b: 2, c: 3 };
    let obj2 = false;
    let obj3 = BigInt(1);
    let obj4 = Object(1n);
    let obj5 = null;
    let obj6 = undefined;
    let obj7 = new Date();
    let obj8 = new RegExp('a');

    expect(boxed(obj1)).toEqual(false);
    expect(boxed(obj2)).toEqual(false);
    expect(boxed(obj3)).toEqual(false);
    expect(boxed(obj4)).toEqual(true);
    expect(boxed(obj5)).toEqual(false);
    expect(boxed(obj6)).toEqual(false);
    expect(boxed(obj7)).toEqual(true);
    expect(boxed(obj8)).toEqual(false);
  });

  it('intersection', () => {
    let obj1 = { a: 1, b: 2, c: 3 };
    let obj2 = { a: 4, b: 5, d: 7 };

    expect(intersection(obj1, obj2)).toEqual({ a: 1, b: 2 });
  });

});
