import { describe, expect, it } from 'vitest';
import { PaperWheelGesture } from '@/components/shared/paper-wheel';
describe('local paper gestures',()=>{
  it('normalizes lines/pages and permits one turn for an entire inertial burst',()=>{
    const wheel=new PaperWheelGesture();
    expect(wheel.consume(1,1,600,0)).toBe(0);
    expect(wheel.consume(2,1,600,20)).toBe(0);
    expect(wheel.consume(1,1,600,40)).toBe(1);
    for(let n=60;n<1000;n+=20)expect(wheel.consume(100,0,600,n)).toBe(0);
    expect(wheel.consume(-1,2,600,1300)).toBe(-1);
  });
});
