import { Construct } from 'constructs';
import { RedisCache } from '@cdktf/provider-azurerm/lib/redis-cache';
import { PrivateEndpoint } from '@cdktf/provider-azurerm/lib/private-endpoint';
import { PrivateDnsZone } from '@cdktf/provider-azurerm/lib/private-dns-zone';
import { PrivateDnsZoneVirtualNetworkLink } from '@cdktf/provider-azurerm/lib/private-dns-zone-virtual-network-link';
import { Id } from '@cdktf/provider-random/lib/id';

interface RedisConstructProps {
  resourceGroupName: string;
  region: string;
  vnetId: string;
  privateLinkSubnetId: string;
  name: string;
}

export class Redis extends Construct {
  public readonly redisCache?: RedisCache;
  public readonly hostname: string;
  public readonly primaryKey: string;

  constructor(scope: Construct, id: string, props: RedisConstructProps) {
    super(scope, id);

    // ランダムIDの生成
    const randomId = new Id(this, 'random_id', {
      byteLength: 2,
    });

    // プライベートDNSゾーンの作成
    const privateDnsZone = new PrivateDnsZone(this, 'redis_dns', {
      name: 'privatelink.redis.cache.windows.net',
      resourceGroupName: props.resourceGroupName,
    });

    // VNetとプライベートDNSゾーンのリンク
    new PrivateDnsZoneVirtualNetworkLink(this, 'redis_dns_link', {
      name: 'redis-dns-link',
      resourceGroupName: props.resourceGroupName,
      privateDnsZoneName: privateDnsZone.name,
      virtualNetworkId: props.vnetId,
    });

    // Redisキャッシュの作成
    this.redisCache = new RedisCache(this, 'redis', {
      name: `${props.name}-${randomId.hex}`,
      resourceGroupName: props.resourceGroupName,
      location: props.region,
      capacity: 0,
      family: 'C',
      skuName: 'Standard',
      nonSslPortEnabled: true,
      minimumTlsVersion: '1.2',
      publicNetworkAccessEnabled: false,
      redisVersion: '6',
      redisConfiguration: {
        maxmemoryPolicy: 'allkeys-lru',
      },
    });

    // プライベートエンドポイントの作成
    new PrivateEndpoint(this, 'redis_pe', {
      name: 'pe-redis',
      location: props.region,
      resourceGroupName: props.resourceGroupName,
      subnetId: props.privateLinkSubnetId,
      privateServiceConnection: {
        name: 'psc-redis',
        privateConnectionResourceId: this.redisCache.id,
        subresourceNames: ['redisCache'],
        isManualConnection: false,
      },
      privateDnsZoneGroup: {
        name: 'pdz-stor',
        privateDnsZoneIds: [privateDnsZone.id],
      },
    });

    // 出力
    this.hostname = this.redisCache?.hostname ?? (this.redisCache?.hostname || '');

    this.primaryKey = this.redisCache?.primaryAccessKey ?? (this.redisCache?.primaryAccessKey || '');
  }
}