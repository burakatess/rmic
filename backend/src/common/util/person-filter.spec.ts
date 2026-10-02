import { personFieldWhere } from './person-filter';

describe('personFieldWhere', () => {
  it('aynı alandaki kişileri OR/in olarak birleştirir', () => {
    expect(personFieldWhere('assigneeId', 'u1,u2')).toEqual({ assigneeId: { in: ['u1', 'u2'] } });
  });
  it('atanmamış ile kişileri aynı alanda OR yapar', () => {
    expect(personFieldWhere('ownerId', 'u1,__UNASSIGNED__')).toEqual({ OR: [{ ownerId: { in: ['u1'] } }, { ownerId: null }] });
  });
  it('Bana atananlar değerini istemciden userId almadan oturum kullanıcısına çözer', () => {
    expect(personFieldWhere('evaluatorId', '__MINE__', 'session-user')).toEqual({ evaluatorId: { in: ['session-user'] } });
  });
});
