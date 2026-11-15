import { describe, expect, it } from 'vitest';
import { bookPose, foldPose, slipPose } from '../../src/components/journey/geometry';
describe('reversible physical scene ordering',()=>{
  it('finishes both independent folds before alignment, then descends',()=>{expect(foldPose(.18)).toMatchObject({second:0,align:0,descend:0});expect(foldPose(.44)).toMatchObject({first:1,align:0,descend:0});expect(foldPose(.75)).toMatchObject({first:1,second:1,align:1,descend:0});});
  it('clears before any travel/open and discovers before lifting a full sheet',()=>{expect(bookPose(.2)).toMatchObject({travel:0,open:0});expect(bookPose(.55)).toMatchObject({lift:1,open:0});expect(slipPose(.35)).toMatchObject({turn:1,lift:0,travel:0});expect(slipPose(.75)).toMatchObject({turn:1,lift:1,settle:0});});
  it('is path independent in reverse and clamps endpoints',()=>{for(const fn of [foldPose,bookPose,slipPose]){const forward=[0,.2,.5,.8,1].map(p=>fn(p));expect([1,.8,.5,.2,0].map(p=>fn(p)).reverse()).toEqual(forward);expect(fn(-1)).toEqual(fn(0));expect(fn(2)).toEqual(fn(1));}});
});
