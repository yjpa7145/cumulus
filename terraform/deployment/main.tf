provider "aws" {
  region = var.region
}

module "sg_module" {
  source = "../sg_module"

  vpc_id = var.vpc_id
}

module "ec2_module" {
  source = "../ec2_module"

  sg_id     = module.sg_module.sg_id
  subnet_id = var.subnet_id
}
