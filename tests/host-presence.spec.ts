import {test,expect} from '@playwright/test';
import {hostGraceMs,heartbeatIsFresh} from '../lib/host-presence';
test('lobby heartbeats allow a longer pause, while active games recover promptly',()=>{
 const now=1000000;
 expect(hostGraceMs('lobby')).toBe(120000);expect(hostGraceMs('submitting')).toBe(40000);
 expect(heartbeatIsFresh({pid:'host',ts:now-90000},'host',now,'lobby')).toBe(true);
 expect(heartbeatIsFresh({pid:'host',ts:now-121000},'host',now,'lobby')).toBe(false);
 expect(heartbeatIsFresh({pid:'host',ts:now-41000},'host',now,'voting')).toBe(false);
 expect(heartbeatIsFresh({pid:'old-host',ts:now},'host',now,'lobby')).toBe(false);
 expect(heartbeatIsFresh({pid:'host',ts:'bad'},'host',now,'lobby')).toBe(false);
 expect(heartbeatIsFresh({pid:'host',ts:now+60000},'host',now,'lobby')).toBe(false);
});
