declare module '@prisma/client' {
  export enum Role {
    TENANT_OWNER = 'TENANT_OWNER',
    TENANT_ADMIN = 'TENANT_ADMIN',
    PIPELINE_MANAGER = 'PIPELINE_MANAGER',
    WRITER = 'WRITER',
    MEMBER = 'MEMBER',
    GUEST_PARTNER = 'GUEST_PARTNER'
  }

  export class PrismaClient {
    [key: string]: any;
    $transaction<T>(arg: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>): Promise<T>;
    $executeRaw(query: TemplateStringsArray, ...values: any[]): Promise<any>;
  }
}
