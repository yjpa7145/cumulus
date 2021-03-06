
variable "prefix" {
  type = string
}

variable "aws_profile" {
  type    = string
  default = "default"
}

variable "permissions_boundary" {
  type = string
}

variable "vpc_id" {
  type    = string
  default = ""
}

variable "subnet_ids" {
  type    = list(string)
  default = []
}

variable "security_groups" {
  type    = list(string)
  default = []
}

variable "target_bucket" {
  type = string
}

variable "target_prefix" {
  type = string
}

variable "source_bucket" {
  type = string
}

variable "source_prefix" {
  type = string
}
